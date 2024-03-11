const { invoke } = window.__TAURI__.tauri;
const { open, Command } = window.__TAURI__.shell;
const { appWindow } = window.__TAURI__.window;
const dialog = window.__TAURI__.dialog;
const path = window.__TAURI__.path;
const fs = window.__TAURI__.fs;

require.config({ paths: { "vs": "./assets/monaco" }});

let websocket, websocketInterval;
let loginSection, exploitSection;
let loginForm, loginToken, loginSubmit;
let exploitIndicator, exploitTabs, exploitEditor, exploitScripts, exploitScriptsSearch, exploitScriptsFolder;
let editor, editorGetText, editorSetText, editorRefresh;
let exploitInject, exploitExecute, exploitImport, exploitExport, exploitClear, exploitKill, exploitLogout;
let prevConnected, editorReady, activeTab;

function checkActive() {
  if (websocket && websocket.readyState === websocket.OPEN) {
    loginSection.classList.remove("active");
    exploitSection.classList.add("active");
    setupEditor();
  } else {
    exploitSection.classList.remove("active");
    loginSection.classList.add("active");
  }
}

async function getWindowPosition() {
  const position = await appWindow.innerPosition();
  return { x: position.x, y: position.y };
}

async function setWindowPosition(x, y) {
  await window.__TAURI__.window.appWindow.setPosition({ type: "Physical", x, y });
}

function initialize() {
  return new Promise(function (res) {
    websocket = new WebSocket(`wss://loader.live/?login_token="${loginToken.value}"`);

    websocket.onopen = function () {
      websocket.send(JSON.stringify({ type: 1, side_type: "browser" }));
      checkActive();

      websocketInterval = setInterval(function () {
        if (websocket.readyState !== websocket.OPEN) return clearInterval(websocketInterval);
        websocket.send(JSON.stringify({ type: 2 }));
      }, 1000);

      res(websocket.readyState === websocket.OPEN);
    };

    websocket.onmessage = function (message) {
      let json;

      try { json = JSON.parse(message.data); }
      catch { return; };
      
      if (json.status) {
        const connected = json.status === "connected";

        if (prevConnected === connected) {
          return;
        } else {
          prevConnected = connected;
        }

        exploitIndicator.style.backgroundColor = `var(--${connected ? "green" : "red"})`;

        if (connected) {
          exploitExecute.classList.remove("disabled");
          exploitInject.classList.add("disabled");
        } else {
          exploitInject.classList.remove("disabled");
          exploitExecute.classList.add("disabled");
        }
      }
    };

    websocket.onerror = function () {
      checkActive();
      res(false);
    };

    websocket.onclose = function () {
      checkActive();
      res(false);
    };
  });
}

async function login() {
  loginForm.classList.add("disabled");
  await setToken(loginToken.value);
  await initialize();
  loginForm.classList.remove("disabled");
}

async function createDirectory(directory, recursive) {
  try {
    await fs.createDir(directory, { dir: fs.BaseDirectory.AppConfig, recursive });
    return true;
  } catch {
    return false;
  }
}

async function readDirectory(directory) {
  try {
    const entries = await fs.readDir(directory, { dir: fs.BaseDirectory.AppConfig });
    return entries;
  } catch {
    return [];
  }
}

async function exists(path) {
  try {
    return await fs.exists(path, { dir: fs.BaseDirectory.AppConfig });
  } catch {
    return false;
  }
}

async function writeFile(file, contents) {
  try {
    await fs.writeTextFile(file, contents, { dir: fs.BaseDirectory.AppConfig });
    return true;
  } catch {
    return false;
  }
}

async function readFile(file, noDir) {
  try {
    return await fs.readTextFile(file, { dir: noDir ? undefined : fs.BaseDirectory.AppConfig });
  } catch {
    return null;
  }
}

async function readBinary(file, noDir) {
  try {
    return await fs.readBinaryFile(file, { dir: noDir ? undefined : fs.BaseDirectory.AppConfig });
  } catch {
    return null;
  }
}

async function writeBinary(file, contents) {
  try {
    await fs.writeBinaryFile(file, contents, { dir: fs.BaseDirectory.AppConfig });
    return true;
  } catch {
    return false;
  }
}

async function deleteFile(file, noDir) {
  try {
    await fs.removeFile(file, { dir: noDir ? undefined : fs.BaseDirectory.AppConfig });
    return true;
  } catch {
    return false;
  }
}

async function getToken() {
  return await readFile("kr-token");
}

async function setToken(token) {
  return await writeFile("kr-token", token);
}

async function getActiveTab() {
  return await readFile("kr-tab");
}

async function setActiveTab(tab) {
  activeTab = tab;
  if (editorSetText) editorSetText(await getTab(activeTab));
  return await writeFile("kr-tab", tab);
}

async function checkExecutable() {
  return await exists("kr-executable.exe");
}

async function setExecutable(data) {
  return await writeBinary("kr-executable.exe", data);
}

function emptyScripts() {
  exploitScripts.innerHTML = "";
}

function onClick(element, cb) {
  let down = false;

  element.addEventListener("mousedown", function() {
    down = true;
  });

  element.addEventListener("mouseup", function(e) {
    if (down && !element.classList.contains("disabled")) {
      if (e.button === 0) cb("left");
      else if (e.button === 1) cb("middle");
      else if (e.button === 2) cb("right");
    }

    down = false;
  });
}

function addScript(name) {
  const script = document.createElement("div");
  script.className = "script";
  script.innerText = name;
  script.addEventListener("mousedown", function (e) {
    if (e.button === 1) e.preventDefault();
  });
  onClick(script, async function (button) {
    const path = `scripts/${name}`;
    const script = await readFile(path);

    if (script && button === "left") editorSetText(script);
    else if (button === "middle") {
      deleteFile(path);
      loadScripts();
    }
    else if (script && button === "right") execute(script);
  });
  exploitScripts.appendChild(script);
}

function populateScripts(scripts) {
  emptyScripts();
  scripts.forEach(addScript);
}

async function loadScripts() {
  if (!await exists("scripts")) await createDirectory("scripts", true);
  const scripts = await readDirectory("scripts");
  populateScripts(scripts
    .filter((s) => s.name).map((s) => s.name)
    .filter((s) => [".lua", ".txt"].some((e) => s.endsWith(e)))
    .filter((s) => s.toLowerCase().includes((exploitScriptsSearch.value || "")?.toLowerCase())));
}

function emptyTabs() {
  exploitTabs.innerHTML = "";
}

function addTab(title) {
  const tab = document.createElement("div");
  tab.className = activeTab === title ? "tab active" : "tab";
  tab.innerText = title;
  tab.addEventListener("click", async function () {
    await setActiveTab(title);
    await loadTabs();
  });
  exploitTabs.appendChild(tab);
}

function populateTabs(tabs) {
  emptyTabs();
  tabs.forEach(addTab);
}

async function loadTabs() {
  const tabAmount = 10;
  if (!await exists("tabs")) await createDirectory("tabs", true);

  const tabs = [];

  for (var i = 0; i < tabAmount; i++) {
    const path = `tabs/kr-${i + 1}`;
    if (!await exists(path)) await writeFile(path, "");
    tabs.push((i + 1).toString());
  }

  populateTabs(tabs);
}

async function setTab(number, content) {
  await writeFile(`tabs/kr-${number}`, content);
}

async function getTab(number) {
  return (await readFile(`tabs/kr-${number}`) || "");
}

async function askForExecutable() {
  exploitInject.classList.add("disabled");

  const selected = await dialog.open({
    title: "Select Ro-Exec",
    defaultPath: await path.downloadDir(),
    filters: [
      {
        name: "Ro-Exec Executable",
        extensions: ["exe"]
      }
    ]
  });

  if (selected) {
    const data = await readBinary(selected, true);
    
    if (data) {
      await setExecutable(data);
      try { await deleteFile(selected, true); }
      catch {};
      if (!prevConnected) exploitInject.classList.remove("disabled");
      return true;
    }
  }

  if (!prevConnected) exploitInject.classList.remove("disabled");
  return false;
}

async function isRobloxRunning() {
  return await invoke("is_process_running", { name: "RobloxPlayerBeta" });
}

async function killRoblox() {
  return await invoke("kill_process", { name: "RobloxPlayerBeta" });
}

async function inject() {
  if (!await isRobloxRunning()) {
    return;
  }

  if (!await checkExecutable()) {
    if (!await askForExecutable()) return;
  }

  try {
    exploitInject.classList.add("disabled");
    exploitIndicator.style.backgroundColor = "var(--yellow)";

    const command = new Command("kr-inject", [], { cwd: await path.appConfigDir() });

    let isDone;
    let child;

    async function killCheck() {
      if (child) await child.kill();
    }

    async function done() {
      if (isDone) return;
      isDone = true;
      await killCheck();
      if (!prevConnected) exploitInject.classList.remove("disabled");
      exploitIndicator.style.backgroundColor = `var(--${prevConnected ? "green" : "red"})`;
    }

    command.on("close", done);
    command.once("error", done);

    child = await command.spawn();
    setTimeout(done, 120 * 1000);
    
    return true;
  } catch {
    return false;
  }
}

function execute(customText) {
  try {
    const text = typeof customText === "string" ? customText : editorGetText();

    if (text && websocket && websocket.readyState === websocket.OPEN) {
      websocket.send(`<SCRIPT>${text}`);
    }

    return true;
  } catch {
    return false;
  }
}


async function _import() {
  exploitImport.classList.add("disabled");

  const selected = await dialog.open({
    title: "Import Script",
    defaultPath: await path.join(await path.appConfigDir(), "scripts"),
    filters: [
      {
        name: "LUA Files",
        extensions: ["lua"]
      },
      {
        name: "Text Files",
        extensions: ["txt"]
      }
    ]
  });

  if (selected) {
    const text = await readFile(selected, true);
    if (text) editorSetText(text);
    exploitImport.classList.remove("disabled");
    return true;
  }

  exploitImport.classList.remove("disabled");
  return false;
}

async function _export() {
  exploitExport.classList.add("disabled");

  const selected = await dialog.save({
    title: "Export Script",
    defaultPath: await path.join(await path.appConfigDir(), "scripts"),
    filters: [
      {
        name: "LUA File",
        extensions: ["lua"]
      },
      {
        name: "Text File",
        extensions: ["txt"]
      }
    ]
  });

  if (selected) {
    const text = editorGetText() || "";
    await writeFile(selected, text);
    exploitExport.classList.remove("disabled");
    return true;
  }

  exploitExport.classList.remove("disabled");
  return false;
}

function clear() {
  editorSetText("");
}

async function kill() {
  if (await isRobloxRunning()) await killRoblox();
}

async function logout() {
  if (websocket) websocket.close();
  checkActive();
}

async function openFolder() {
  try {
    await open(await path.join(await path.appConfigDir(), "scripts"));
    return true;
  } catch {
    return false;
  }
}

function setupEditor() {
  if (editorReady) return;

  require(["vs/editor/editor.main"], async function() {
    let editorProposals = [];
    let dynamicEditorProposals = [];

    function getDependencyProposals() {
      return [...editorProposals, ...dynamicEditorProposals];
    }

    monaco.languages.registerCompletionItemProvider("lua", {
      provideCompletionItems: function() {
        return getDependencyProposals();
      }
    });

    monaco.editor.defineTheme("dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "global", foreground: "84d6f7", fontStyle: "bold" },
        { token: "keyword", foreground: "f86d7c", fontStyle: "bold" },
        { token: "comment", foreground: "388234" },
        { token: "number", foreground: "ffc600" },
        { token: "string", foreground: "adf195" },
        { token: "custom", foreground: "66ffcc", fontStle: "bold" },
      ],
      colors: {
        "editor.background": "#191a1e"
      }
    });

    editor = monaco.editor.create(exploitEditor, {
      language: "lua",
      theme: "dark",
      fontFamily: "Raleway",
      fontSize: 13,
      acceptSuggestionOnEnter: "smart",
      suggestOnTriggerCharacters: true,
      suggestSelection: "recentlyUsed",
      folding: false,
      wordBasedSuggestions : true,
      scrollbar: {
        verticalHasArrows: true,
      },
      minimap: {
        enabled: false,
      },
      showFoldingControls: "always",
      smoothScrolling: true,
      contextmenu: true,
      lineNumbersMinChars: 2
    });

    window.onresize = function() {
      editor.layout();
    };

    editorGetText = function() {
      return editor.getValue();
    }
    
    editorSetText = function(x) {
      editor.setValue(x);
    }

    editorRefresh = function() {
      const text = getText();
      setText("");
      editor.trigger("keyboard", "type", { text: text });
    }

    function editorAddIntellisense(l, k, d, i) {
      let t;
        
      switch(k) {
        case "Class":
          t = monaco.languages.CompletionItemKind.Class;
          break;
        case "Color":
          t = monaco.languages.CompletionItemKind.Color;
          break;
        case "Constructor":
          t = monaco.languages.CompletionItemKind.Constructor;
          break;
        case "Enum":
          t = monaco.languages.CompletionItemKind.Enum;
          break;
        case "Field":
          t = monaco.languages.CompletionItemKind.Field;
          break;
        case "File":
          t = monaco.languages.CompletionItemKind.File;
          break;
        case "Folder":
          t = monaco.languages.CompletionItemKind.Folder;
          break;
        case "Function":
          t = monaco.languages.CompletionItemKind.Function;
          break;
        case "Interface":
          t = monaco.languages.CompletionItemKind.Interface;
          break;
        case "Keyword":
          t = monaco.languages.CompletionItemKind.Keyword;
          break;
        case "Method":
          t = monaco.languages.CompletionItemKind.Method;
          break;
        case "Module":
          t = monaco.languages.CompletionItemKind.Module;
          break;
        case "Property":
          t = monaco.languages.CompletionItemKind.Property;
          break;
        case "Reference":
          t = monaco.languages.CompletionItemKind.Reference;
          break;
        case "Snippet":
          t = monaco.languages.CompletionItemKind.Snippet;
          break;
        case "Text":
          t = monaco.languages.CompletionItemKind.Text;
          break;
        case "Unit":
          t = monaco.languages.CompletionItemKind.Unit;
          break;
        case "Value":
          t = monaco.languages.CompletionItemKind.Value;
          break;
        case "Variable":
          t = monaco.languages.CompletionItemKind.Variable;
          break;
      };
        
      editorProposals.push({
        label: l,
        kind: t,
        detail: d,
        insertText: i
      });
    };

    for (const key of ["_G", "_VERSION", "Enum", "game", "plugin", "shared", "script", "workspace", "DebuggerManager", "elapsedTime", "LoadLibrary", "PluginManager", "settings", "tick", "time", "typeof", "UserSettings"]) {
      editorAddIntellisense(key, "Keyword", key, key);
    }

    for (const key of ["and", "break", "do", "else", "elseif", "end", "false", "for", "function", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while"]) {
      editorAddIntellisense(key, "Variable", key, key);
    }

    for (const key of ["math.abs", "math.acos", "math.asin", "math.atan", "math.atan2", "math.ceil", "math.cos", "math.cosh", "math.deg", "math.exp", "math.floor", "math.fmod", "math.frexp", "math.huge", "math.ldexp", "math.log", "math.max", "math.min", "math.modf", "math.pi", "math.pow", "math.rad", "math.random", "math.randomseed", "math.sin", "math.sinh", "math.sqrt", "math.tan", "math.tanh", "table.concat", "table.foreach", "table.foreachi", "table.sort", "table.insert", "table.remove", "Color3.new", "Instance.new", "BrickColor.new", "Vector3.new", "Vector2.new", "debug.gethook", "debug.getinfo", "debug.getlocal", "debug.getmetatable", "debug.getregistry", "debug.getupvalue", "debug.getuservalue", "debug.sethook", "debug.setlocal", "debug.setmetatable", "debug.setupvalue", "debug.setuservalue", "debug.traceback", "debug.upvalueid", "debug.upvaluejoin", "string.byte", "string.char", "string.dump", "string.find", "string.format", "string.gmatch", "string.gsub", "string.len", "string.lower", "string.match", "string.rep", "string.reverse", "string.sub", "string.upper", "coroutine.create", "coroutine.resume", "coroutine.running", "coroutine.status", "coroutine.wrap", "coroutine.yield"]) {
      editorAddIntellisense(key, "Method", key, key);
    }

    for (const key of ["Drawing", "debug", "Instance", "Color3", "Vector3", "Vector2", "BrickColor", "math", "table", "string", "coroutine", "Humanoid", "ClickDetector", "LocalScript", "Model", "ModuleScript", "Mouse", "Part", "Player", "Script", "Tool", "RunService", "UserInputService", "Workspace"]) {
      editorAddIntellisense(key, "Class", key, key);
    }

    for (const key of ["print", "warn", "wait", "info", "printidentity", "assert", "collectgarbage", "error", "getfenv", "getmetatable", "setmetatable", "ipairs", "loadfile", "loadstring", "newproxy", "next", "pairs", "pcall", "spawn", "rawequal", "rawget", "rawset", "select", "tonumber", "tostring", "type", "unpack", "xpcall", "delay", "stats", ":Remove()", ":BreakJoints()", ":GetChildren()", ":FindFirstChild()", ":FireServer()", ":InvokeServer()", ":ClearAllChildren()", ":Clone()", ":Destroy()", ":FindFirstAncestor()", ":FindFirstAncestorOfClass()", ":FindFirstAncestorWhichIsA()", ":FindFirstChildOfClass()", ":FindFirstChildWhichIsA()", ":GetDebugId()", ":GetDescendants()", ":GetFullName()", ":IsA()", ":GetPropertyChangedSignal()", ":IsAncestorOf()", ":IsDescendantOf()", ":WaitForChild()", ":Connect()", ":AncestryChanged()", ":Changed()", ":ChildAdded()", ":ChildRemoved()", ":DescendantAdded()", ":DescendantRemoving()", ":GetService()", ":GetObjects()", ":HttpGet()", ":Wait()"]) {
      editorAddIntellisense(key, "Function", key, key.includes(":") ? key.substring(1, key.length) : key);
    }

    for (const key of ["Visible", "Color", "Transparency", "Thickness", "From", "To", "Text", "Size", "Center", "Outline", "OutlineColor", "Position", "TextBounds", "Font", "Data", "Rounding", "NumSides", "Radius", "Filled", "PointA", "PointB", "PointC", "PointD"]) {
      editorAddIntellisense(key, "Property", "Property for Drawing Library", key);
    }

    function updateIntelliSense() {
      dynamicEditorProposals = [];
      const editorContent = editor.getValue();

      let functionMatch;
      let variableMatch;

      const functionRegex = /(?:\blocal\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
      const variableRegex = /(?:\blocal\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
    
      while ((functionMatch = functionRegex.exec(editorContent)) !== null) {
        dynamicEditorProposals.push({ label: functionMatch[1], kind: monaco.languages.CompletionItemKind.Function, detail: "Function", insertText: functionMatch[1] });
      }
    
      while ((variableMatch = variableRegex.exec(editorContent)) !== null) {
        dynamicEditorProposals.push({ label: variableMatch[1], kind: monaco.languages.CompletionItemKind.Variable, detail: "Variable", insertText: variableMatch[1] });
      }
    }

    editorSetText(await getTab(activeTab));
    editor.onDidChangeModelContent(async function() {
      updateIntelliSense();
      const text = editorGetText();
      await setTab(activeTab, text);
    });

    updateIntelliSense();
  });

  editorReady = true;
}

window.addEventListener("DOMContentLoaded", async function () {
  // Context Menu
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Set-up
  await createDirectory("", true);
  await createDirectory("scripts", true);
  await createDirectory("autoexec", true);
  await createDirectory("tabs", true);

  // Sections
  loginSection = document.querySelector("body > .login");
  exploitSection = document.querySelector("body > .exploit");

  // Login
  loginForm = document.querySelector(".login .form");
  loginToken = document.querySelector(".login .kr-input.token");
  loginSubmit = document.querySelector(".login .kr-button.submit");
  loginSubmit.addEventListener("click", login);

  const token = await getToken();

  if (token && token !== "") {
    loginToken.value = token;
    login();
  }

  // Exploit
  exploitIndicator = document.querySelector(".exploit .title .indicator");
  exploitTabs = document.querySelector(".exploit .main .container .tabs");
  exploitEditor = document.querySelector(".exploit .main .container .editor");
  exploitScripts = document.querySelector(".exploit .main .container-2 .scripts");
  exploitScriptsSearch = document.querySelector(".exploit .main .container-2 .kr-input.search");
  exploitScriptsFolder = document.querySelector(".kr-folder");

  // Scripts
  loadScripts();
  exploitScriptsSearch.addEventListener("input", loadScripts);
  setInterval(loadScripts, 1000);

  // Tab
  const tab = await getActiveTab();

  if (!tab) {
    await setActiveTab("1");
    activeTab = "1";
  } else {
    activeTab = tab;
  }

  // Tabs
  loadTabs();

  // Buttons
  exploitInject = document.querySelector(".kr-inject");
  exploitExecute = document.querySelector(".kr-execute");
  exploitImport = document.querySelector(".kr-import");
  exploitExport = document.querySelector(".kr-export");
  exploitClear = document.querySelector(".kr-clear");
  exploitKill = document.querySelector(".kr-kill");
  exploitLogout = document.querySelector(".kr-logout");
  onClick(exploitInject, async function (button) {
    if (button === "left") await inject();
    else if (button === "right") await askForExecutable();
  });
  exploitExecute.addEventListener("click", execute);
  exploitImport.addEventListener("click", _import);
  exploitExport.addEventListener("click", _export);
  exploitClear.addEventListener("click", clear);
  exploitKill.addEventListener("click", kill);
  exploitLogout.addEventListener("click", logout);
  exploitScriptsFolder.addEventListener("click", openFolder);
});