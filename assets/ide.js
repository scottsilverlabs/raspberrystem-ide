var run, save, GET, POST, changeHandle, changeSocket, openFile, removePopup,
	changeSocketInit, toggleOutput, toggleWeb, settingsDialog; //Function prototypes
var config, outputOpen, outputPos, back, ws = null, titleText, filename, type, changed, webShowing = false, themes, currentTheme;
var bindableFunc = ["save", "run", "toggleWeb", "toggleOutput", "settingsDialog",
	"openFile"];
var leftButtons = ["Run", "Open File", "Save", "Theme"];
var keybindings = {};

window.onload = function() {
	if (window.MozWebSocket)
		window.WebSocket = window.MozWebSocket;
	if (document.location.host == "127.0.0.1")
		document.getElementById("outputbutton").src = "/assets/images/arrow-down.png";

	codewrapper = document.getElementById("codewrapper");
	output = document.getElementById("output");
	outputHolder = document.getElementById("outputActual");
	outputText = document.getElementById("outputtext");
	stdin = document.getElementById("stdin");
	stdin.onkeydown = function(k) {
		if (k.keyCode == 13 && ws) {
			ws.send(stdin.value + "\n");
			stdin.value = "";
		}
	};
	playButton = document.getElementById("play");
	saveButton = document.getElementById("save");
	saveButton.onclick = save;
	ide = document.getElementById("ide");
	web = document.getElementById("webview");
	titleHolder = document.getElementById("title");
	config = JSON.parse(GET("/api/configuration"));
	config.bootfiles = config.bootfiles.split(",").filter(function(x) { return x != ""; });
	config.ip = config.ip.split("\n").filter(function(x) { return x != ""; }).join("\n");

	editor = CodeMirror(document.getElementById("codewrapper"), {
		mode: {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		},
		autofocus: true,
		lineNumbers: true,
		indentUnit: 4,
		indentWithTabs: true,
		matchBrackets: true,
		theme: "solarized-dark",
		textWrapping: true,
		pollInterval: 300,
		workDelay: 400, //Default: 300
		viewportMargin: 3, //Default: 10
		undoDepth: config.undodepth || 20 //Default: 20
	});
	themes = editor.options.theme.split(" ")
	for (var i in themes)
		output.classList.add("cm-s-"+themes[i]);
	currentTheme = themes[0];
	editor.on("change", changeHandle);
	changeSocketInit();
	if (config.webviewopen == "true")
		toggleWeb();
	if (config.buttontext == "true") {
		var header = document.getElementById("header");
		var nodes = header.childNodes;
		for (i = 2; i < 5; i++) {
			nodes[(i*2) - 1].style.paddingLeft = "2em";
		}
		nodes[11].style.marginLeft = "-5.75em";
		nodes[13].style.marginLeft = "-2em";
		header.style.height = "2.6em";
		var label;
		for (i in leftButtons) {
			label = document.createElement("div");
			header.appendChild(label);
			label.classList.add("buttonlabel");
			label.innerHTML = leftButtons[i];
			label.style.position = "absolute";
			label.style.left = 5.45 * i + "em";
			label.style.marginLeft = "-1.7em";
			label.style.top = "2.2em";
			label.style.width = "5.75em";
			label.style.textAlign = "center";
			label.style.fontSize = "12px";
		}

		label = document.createElement("div");
		header.appendChild(label);
		label.classList.add("buttonlabel");
		label.innerHTML = "Output";
		label.style.position = "absolute";
		label.style.left = "100%";
		label.style.marginLeft = "-8.25em";
		label.style.top = "2.2em";
		label.style.width = "3em";
		label.style.textAlign = "center";
		label.style.fontSize = "12px";

		label = document.createElement("div");
		header.appendChild(label);
		label.classList.add("buttonlabel");
		label.innerHTML = "Web";
		label.style.position = "absolute";
		label.style.left = "100%";
		label.style.marginLeft = "-3em";
		label.style.top = "2.2em";
		label.style.width = "3em";
		label.style.textAlign = "center";
		label.style.fontSize = "12px";

		ide.style.height = ide.style.height.replace("2em", "2.5em");
	}
	filename = config.lastfile || "Untitled.py";
	/* Create keybinding table:
	keybindings[keyString] = function() { bindableFunction(); } */
	for (i in config) {
		if (typeof config[i] == "string") {
			var func = config[i].substring(0, 1).toLowerCase() + config[i].substring(1);
			if (bindableFunc.indexOf(func) + 1) {
				keybindings[i] = new Function(func + "()");
			}
		}
	}
	if (GET("/api/listfiles").split("\n")[0] === "")
		save(); //Create untitled document if there are no documents
	asyncGET("api/listthemes", function(r) { themes = r.split("\n"); });
	loadFile(filename, true);
	welcome();
};

//Save on window close
window.onbeforeunload = function() {
	save();
	changeSocket.close();
};

//Process keybindings
window.onkeydown = function(k) {
	var keyseq = "";
	if (k.ctrlKey || k.metaKey)
		keyseq += "ctrl+";
	if (k.shiftKey)
		keyseq += "shift+";
	if (k.altKey)
		keyseq += "alt+";
	keyseq += String.fromCharCode(k.keyCode).toLowerCase();
	if (keybindings[keyseq]) {
		k.preventDefault(); //Used to prevent default action...duh.
		keybindings[keyseq]();
		return false; //Used to prevent default action
	}
};

//Focus on the editor when the header is clicked
function headerClick() {
	if (back === null)
		editor.focus();
}

//Sets the title text and sets to width of the title which is used for centering.
function setTitle(text) {
	var width = text.length*(2/3);
	if (webShowing) {
		document.getElementById("running").style.marginLeft = "-" + (parseFloat(width) + 5) + "em";
		document.getElementById("nosign").style.marginLeft = "-" + (parseFloat(width) + 5.5) + "em";
	} else {
		document.getElementById("running").style.marginLeft = "-" + ((width/2) + 2) + "em";		
		document.getElementById("nosign").style.marginLeft = "-" + ((width/2) + 2.5) + "em";		
	}
	titleHolder.innerHTML = text.replace(/-/g, " ");
	titleHolder.style.width = width + "em";
}

//Used to replicate hover actions on buttons for keyboard controls.
var currButton;
function unhover() {
	if (currButton)
		currButton.className = currButton.className.replace("_hover", "");
}

//Used to replicate hover actions on buttons for keyboard controls.
function hover(button) {
	if (back === null || !currButton) return;
	unhover();
	currButton = button;
	currButton.scrollIntoViewIfNeeded(); //May throw off the main viewing frame
	//TODO, replace.
	currButton.className = currButton.className.replace(/^filebutton/,
		"filebutton_hover").replace(" filebutton", " filebutton_hover")
		.replace(/^button/, "button_hover").replace(" button", " button_hover")
		.replace("pencilbutton", "pencilbutton_hover");
}

var place = [0, 0]; //Place in list, standard x, y format
var typePlace = 0; //For the new file prompt
var types = ["py", "spr", "sh"];
//Up/Down keys
function updown(dir) {
	if (back === null) return; //Check for popup
	place[1] += dir;
	var button = document.getElementById("Button"+place[0]+","+place[1]);
	if (button)
		hover(button);
	else {
		place[1] -= dir;
		if (button = document.getElementById("Button"+place[0]+","+place[1]));
			hover(button);
	}
}

//Left/right keys
function leftright(dir) {
	if (back === null) return;
	place[0] += dir;
	var button = document.getElementById("Button"+place[0]+","+place[1]);
	if (button)
		hover(button);
	else {
		place[0] -= dir;
		if (button = document.getElementById("Button"+place[0]+","+place[1]));
			hover(button);
	}
}

//Enter key
function enter() {
	if (back === null) return;
	var button = document.getElementById("Button"+place[0]+","+place[1]);
	if (button)
		button.click();
}

//Handle generic keys, keybindings are handled in the window.onkeydown function
function key(k) {
	if (!document.getElementById("editfile"))
		switch (k.keyCode) {
			case 27: removePopup(); editor.focus(); break;
			case 37: leftright(-1); break; //Left
			case 39: leftright(1); break; //Right
			case 38: updown(-1); break; //Up
			case 40: updown(1); break; //Down
			case 13: enter(); break;
		}
	else
		if (k.keyCode == 27) {
			document.getElementById("Button0,0").click();
		} else if (k.keyCode == 13) {
			document.getElementById("Button3,0").click();
		}
}

function setupButton(button, x, y) {
	button.onmouseenter = new Function("hover(this)");
	button.onmouseleave = unhover;
	button.id = "Button" + x + "," + y;
}

//Send GET request to url
function GET(url) {  
	var req = new XMLHttpRequest();
	req.open("GET", url, false);
	req.send(null);
	return req.responseText;
}

//Send Async GET request to url
function asyncGET(url, callback) {
	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (req.readyState == 4)
			callback(req.responseText);
	};
	req.open("GET", url, true);
	req.send(null);
}

//Send POST request to url, where args is a dictionary of arguments
function POST(url, args) {  
	argsActual = "";
	for (var i in args)
		argsActual += "&"+i+"="+encodeURIComponent(args[i]);
	argsActual = argsActual.substring(1);
	var req = new XMLHttpRequest();
	req.open("POST", url, false);
	req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	req.send(argsActual);
	return req.responseText;
}

//Saves the current file's contents to the server
function save(override) {
	if (changed) {
		changed = false;
		saveButton.src = "/assets/images/savegray.png";
		saveButton.style.cursor = "initial";
		if (filename !== "") {
			POST("/api/savefile", {"file": filename, "content": editor.getValue()});
			if (filename.match(/^Untitled([0-9]+)?\.py$/) && !override) {
				console.log('Filename match');
				saveRename(filename);
			}
		}
	}
}

function saveRename(fname) {
	removePopup();
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");
	back.focus();

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("filepopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.classList.add("maincolor");
	title.innerHTML = "Save File";

	text = document.createElement("input");
	popup.appendChild(text);
	text.classList.add("editfiletext");
	text.type = "text";
	text.value = fname.replace(/-/g, " ");

	var okay = document.createElement("div");
	popup.appendChild(okay);
	okay.classList.add("button");
	okay.innerHTML = "OK";
	okay.style.fontSize = 15;
	okay.style.position = "relative";
	okay.style.width = "20%";
	okay.style.left = "40%";
	okay.style.top = "0.7em";
	setupButton(okay, 0, 0);
	okay.onclick = function() {
		origTval = text.value;
		origExt = fname.split(".")[fname.split(".").length - 1];
		if (origTval.split(".").length < 2) origTval += "." + origExt;
		tval = origTval.replace(/ /g, "-");
		if (tval != fname) {
			var files = GET("/api/listfiles").split("\n");
			if (files.indexOf(tval) != -1) {
				ynPrompt("Overwrite", "Overwrite " + tval, function() {
					POST("/api/copyfile", {"from": fname, "to": tval});
					POST("/api/deletefile", {"file": fname});
					removePopup();
					loadFile(origTval);
				},
				function() {
					saveRename(fname);
				});
			} else {
				POST("/api/copyfile", {"from": fname, "to": tval});
				POST("/api/deletefile", {"file": fname});
				removePopup();
				loadFile(origTval);
			}
		} else {
			removePopup();
			loadFile(origTval);
		}
	};
	text.focus();
}

//Sets the output text to text
var linepos = 0; //Used for tracking \r position
function setOutput(text) {
	outputText.innerHTML = text;
	stdin.scrollIntoViewIfNeeded();
}

//Appends to output and handles \r and \f
var trim_msg = "<span style=\"color:red;\">-- OUTPUT TRIMMED --</span>\n";
function appendOutput(text) {
	setOutput(outputText.innerHTML + text);
}


//Called when the script stops running on the server side, highlights errors in the output
var errs = [];
var errRegex = new RegExp(/\s+File ".+", line \d+.*\n.+\n.+\^\n.+: .+/g);
var traceRegex = new RegExp(/Traceback.*:\n(\s+File ".+", line \d+.*\n.*\n)+.*(Error|Interrupt|Exception).*/g);
var stripRegex = new RegExp(/(^\s+|\s+$)/g);
function errorHighlight() {
	var errString = outputText.innerHTML;
	var lines = errString.split("\n");
	var errors = errString.match(errRegex) || [];
	var offset = 0;
	var line, start, end, lnum;

	for (var i in errors) {
		var err = errors[i];
		var errLines = err.split("\n");
		var errLinePos = errLines[0].split(", ")[1].substring(5);
		line = editor.lineInfo(errLinePos - 1 - offset);
		var stripped = errLines[1].replace(stripRegex, "");
		var match = line.text.indexOf(stripped);
		var start = {"line": errLinePos-1, "ch": match};
		end = {"line": errLinePos-1, "ch": match+stripped.length};

		errs.push(editor.markText(start, end, {
			className: "cm-error",
			clearOnEnter: true,
			title: errLines[3],
		}));
		if (i === 0)
			editor.scrollTo(0, errLinePos);
		setOutput(outputText.innerHTML.replace(err, "<span style=\"color:red;\">" +
			err + "</span>"));
	}
	var traces = errString.match(traceRegex);
	for (var j = 0; traces && j < traces.length; j++) {
		var split = traces[j].split("\n");
		var message = split[0];
		for (i = 1; i < split.length-1; i++) {
			line = split[i];
			if (i%2 !== 0) {
				end = 0;
				for (var k = 8; k < line.length; k++)
					if (line.substr(k, 1) == "\"")
						end = k;
				message += "\n"+line.substring(0, 8) + "<span class=\"cm-variable\">" +
					line.substring(8, end) + "</span>";
				var nextend = end+8;
				while (parseInt(line.substr(nextend, 1)) || line.substr(nextend, 1) == "0")
					nextend++;
				message += line.substring(end, end+8) + "<span class=\"cm-variable\">" +
					line.substring(end+8, nextend) + "</span>" + line.substring(nextend);
				if (line.substring(end-filename.length, end) == filename) {
					lnum = parseInt(line.substring(end + 8, nextend)) - 1 - offset;
					start = {"line": lnum, "ch": 0};
					end = {"line": lnum, "ch": editor.getLine(lnum).length};
					errs.push(editor.markText(start, end, {
						className: "cm-error",
						clearOnEnter: true,
						title: "Traceback",
					}));
					editor.scrollTo(0, lnum);
				}
			} else {
				message += "\n"+"<span class=\"cm-variable\">"+line+"</span>";
			}
		}
		message += "\n"+split[split.length - 1];
		setOutput(outputText.innerHTML.replace(traces[j], 
			"<span style=\"color:red;\">" + message + "</span>"));
	}
}

//Colors characters in the editor while in a .spr file
function sprColor(change) {
	var baseline = change.from.line;
	var ldiff = change.to.line - change.from.line;
	if (ldiff === 0 && change.text.length == 2) {
		var marks = editor.findMarksAt({line: baseline+1, ch: 0});
		for (var i = 0; i < marks.length; i++)
			marks[i].clear();
		var ch = editor.getLine(baseline+1).substring(0, 1).toLowerCase();
		var code = ch.charCodeAt(0);
		var start = {"line": baseline+1, "ch": 0};
		var end = {"line": baseline+1, "ch": 1};
		if ((parseInt(ch) && ch !== 0) || (code < 103 && code > 96)) {
			editor.markText(start, end, {
				className: "spr"+ch,
			});
		} else if (ch != "-" && ch != " " && ch != "0") {
			editor.markText(start, end, {
				className: "sprerr",
			});
		} 
	}
	for (var i = 0; i <= ldiff; i++) {
		var line = editor.getLine(baseline+i);
		var schar = 0;
		var echar = line.length;
		if (i === 0)
			schar = change.from.ch;
		else if (i == ldiff)
			echar = change.to.ch;
		for (var j = schar; j < echar; j++) {
			var ch = line.substring(j, j+1).toLowerCase();
			var code = ch.charCodeAt(0);
			var start = {"line": baseline+i, "ch": j};
			var end = {"line": baseline+i, "ch": j+1};
			if (((parseInt(ch) && ch !== 0 ) || (code < 103 && code > 96)) 
				&& (j === 0 || line.substring(j-1, j) == " ")) {
				editor.markText(start, end, {
					className: "spr"+ch,
				});
			} else if (ch != "-" && ch != " " && ch != "0" || (ch != " " 
				&& j !== 0 && line.substring(j-1, j) != " ")) {
				editor.markText(start, end, {
					className: "sprerr",
				});
			}
		}
	}
}

//Checks the line designated by lnum for space/tab conflicts
var errTags = {};
function checkForSpaces(lnum) {
	var start = 0;
	var line = editor.getLine(lnum);
	if (errTags[lnum] === undefined)
		errTags[lnum] = [];
	var a;
	while (a = errTags[lnum].pop())
		a.clear();
	for (var j in line) {
		if (line[j] == " " && start == -1) {
			start = j;
		} else if (start != -1 && line[j] != " ") {
			errTags[lnum].push(editor.markText({"line": lnum, "ch": start}, {"line": lnum, "ch": j}, {
				className: "cm-error",
			}));
			start = -1;
		} else if (start != -1 && j == line.length - 1) {
			errTags[lnum].push(editor.markText({"line": lnum, "ch": start}, {"line": lnum, "ch": j + 1}, {
				className: "cm-error",
			}));
			start = -1;
		}
		if (line[j] != "\t" && line[j] != " ")
			break;
	}
}

/*
Handles changes in the file, used for sprite highlighting, space/tab conflicts,
and updating other clients working on the same file.
*/
var last = null;
function changeHandle(cm, change) {
	if (!changed) {
		changed = true;
		saveButton.src = "/assets/images/save.png";
		saveButton.style.cursor = "";
	}
	if (type == "spr")
		sprColor(change);
	if (type == "py")
		checkForSpaces(change.from.line);
	if (changeSocket !== null && last === null && change.origin != "setValue") {
		var text = "";
		for (var i in change.text)
			text += "\n" + change.text[i];
		changeSocket.send("CIF:" + change.from.line + "," + change.from.ch + "," +
			change.to.line + "," + change.to.ch + "," + text.substring(1));
	} else {
		last = null;
	}
}

//Creates socket connection to the server and sends the filename
var loopID;
function socket() {
	ws = new WebSocket("ws://"+document.location.host+"/api/socket");
	ws.onopen = function(event) {
		var a;
		while ((a = errs.pop()) !== undefined)
			a.clear();
		ws.send(filename);
	};
	ws.onclose = function(event) {
		ws = null;
		errorHighlight();
		playButton.src = "/assets/images/play.png";
		document.getElementById("running").src = "/assets/images/rstemlogo.png";
		stdin.style.width = "0";
		//Remove trailing \n
		var innerHTML = outputText.innerHTML;
		if (innerHTML.substring(innerHTML.length - 1) == "\n")
			setOutput(innerHTML.substring(0, innerHTML.length - 1));
		editor.focus();
	};
	ws.onmessage = function(event) {
        if (!outputOpen) {
            outputPos = 0;
            toggleOutput();
            if (document.location.host == "127.0.0.1") {
                stdin.focus();
            } else {
                setTimeout(function() {
                    stdin.focus();
                }, 1000);
            }
        }
		message = event.data;
        var cmd = message.substring(0,8);
        var payload = message.substring(8).replace(/</g, "&lt;").replace(/>/g, "&gt;");
		if (cmd == "started:") {
			document.getElementById("running").src = "/assets/images/running.gif";
		} else if (cmd == "output :") {
			setOutput(payload);
		} else if (cmd == "error  :") {
			msg = payload == "stopped" ? "-- PROGRAM STOPPED --" : "-- PROGRAM FINISHED --";
			appendOutput("<span style=\"color:red;\">" + msg + "</span>\n");
		}
	};
}

var reconnLoop;
function changeSocketInit() {
	if (reconnLoop) {
		clearInterval(reconnLoop);
		reconnLoop = null;
	}
	changeSocket = new WebSocket("ws://"+document.location.host+"/api/change");
	changeSocket.onopen = function(event) {
		changeSocket.send("COF:"+filename);
		good = true;
		document.getElementById("nosign").style.display = "none";
	};
	changeSocket.onclose = function(event) {
		changeSocket = null;
		if (good)
			reconnLoop = setInterval(changeSocketInit, 5000);
		document.getElementById("nosign").style.display = "block";
	};
	changeSocket.onerror = function(event) {
		if (!good)
			alert("Your browser may not support web sockets\nFor the best experience use Google Chrome");
		document.getElementById("nosign").style.display = "block";
	};
	changeSocket.onmessage = function(event) {
		message = event.data;
		if (message == "FILE") {
			var pos = editor.getCursor();
			changeSocket.send("FILE:" + editor.getValue());
			editor.setCursor(pos);
		} else if (message.substring(0, 5) == "FILE:") {
			editor.setValue(message.substring(5));
		} else if (message.substring(0, 6) == "USERS:") {
			var num = parseInt(message.substring(6));
			if (num > 1)
				setTitle(titleText + " (" + num + " users)");
			else
				setTitle(titleText);
		} else {
			var arr = message.split(",");
			var content = message.substring((arr[0] + arr[1] + arr[2] +
				arr[3]).length + 4);
			last = content;
			for (var i = 0; i < 4; i++) {
				arr[i] = parseInt(arr[i]);
			}
			if (editor.lastLine() < parseInt(arr[0])) {
				editor.setValue(editor.getValue()+"\n");
			}
			editor.replaceRange(content, {line:arr[0], ch:arr[1]}, {line:arr[2],
				ch:arr[3]});
		}
	};
}

//Outputs graphical version of sprite file
var sprColorRegex = new RegExp(/[0-9a-fA-F\-]/);
function runSpr() {
	var val = editor.getValue();
	var lines = val.split("\n");
	var valhtml = "";
	for (var i in lines) {
		var line = lines[i].split(" ");
		valhtml += "<div style=\"margin-bottom:0.2em;\">";
		for (var j in line) {
			if (line[j] !== "" && (line[j].match(sprColorRegex) === null ||
				line[j].match(sprColorRegex)[0] != line[j])) {
				appendOutput("<span style=\"color:red;\">ERROR at line " +
					(parseInt(i)+1)+": invalid color \""+line[j]+"\"");
				return;
			} else if (line[j] !== "") {
				if (line[j] == "-")
					line[j] = "0";
				valhtml += "<span style=\"color:#"+line[j]+line[j]+"0000;\">⬤</span>";
			}
		}
		valhtml += "</div>";
	}
	appendOutput(valhtml);
}

//Called by the run button
function run() {
	if (ws === null) {
		save(true);
		linepos = 0;
		outputText.innerHTML = "";
		if (type != "spr") {
			socket();
			stdin.style.width = "100%";
			var i = 0;
			playButton.src = "/assets/images/stop.png";
		} else {
			runSpr();
		}
	} else {
		ws.send("close");
	}
	editor.focus();
}

//Called by the web button
function toggleWeb() {
	var button = document.getElementById("webbutton");
	webShowing = !webShowing;
	setTitle(title.innerHTML);
	if (webShowing) {
		button.src = "/assets/images/arrow-right.png";
		title.className = "headertextRight"; //classList.remove wasn't working in Chromium
		ide.style.width = "50%";
		output.style.width = "50%";
		web.style.left = "50%";
	} else {
		button.src = "/assets/images/arrow-left.png";
		title.className = "headertextCenter";
		ide.style.width = "100%";
		output.style.width = "100%";
		web.style.left = "100%";
	}
	editor.focus();
}

//Removes popups
var popup, text, menu;
function removePopup() {
	if (back != null) {
		back.parentNode.removeChild(back);
		popup.parentNode.removeChild(popup);
		var button = document.getElementById("Button0,0");
		if (button && button.innerHTML == "-- New File --")
				editor.focus();
	}
	back = null;
	place = [0, 0];
}

//Creates a basic yes/no prompt which calls yes or no based on response.
function ynPrompt(titleText, bodyText, yes, no) {
	removePopup();
	
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");
	back.focus();

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("filepopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.classList.add("maincolor");
	title.innerHTML = titleText;

	text = document.createElement("div");
	popup.appendChild(text);
	text.classList.add("deletetext");
	text.innerHTML = bodyText;

	var okay = document.createElement("div");
	popup.appendChild(okay);
	okay.classList.add("fileokay");
	okay.classList.add("button");
	okay.onclick = yes;
	okay.innerHTML = "Yes";
	setupButton(okay, 1, 0);

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "No";
	cancel.classList.add("filecancel");
	cancel.classList.add("button");
	cancel.onclick = no;
	setupButton(cancel, 0, 0);
}

//Are you sure prompt for file deletion
function deletePrompt(fname) {
	ynPrompt("Delete", "Delete " + fname + "?", function() {
		POST("/api/deletefile", {"file": fname});
		removePopup();
		openFile();
	},
	function() {
		removePopup();
		openFile();
	});
}

//Called by the edit button in the Select File prompt
function editFile(fname) {
	removePopup();
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");
	back.focus();

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("filepopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.classList.add("maincolor");
	title.innerHTML = "Edit File";

	text = document.createElement("input");
	popup.appendChild(text);
	text.classList.add("editfiletext");
	text.type = "text";
	text.id = "editfile";
	text.value = fname.replace(/-/g, " ");

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("button");
	cancel.style.fontSize = 15;
	cancel.style.position = "relative";
	cancel.style.left = "2%";
	cancel.style.width = "22%";
	cancel.style.top = "12%";
	setupButton(cancel, 0, 0);
	cancel.onclick = function() {
		removePopup();
		openFile();
	};

	var duplicate = document.createElement("div");
	popup.appendChild(duplicate);
	duplicate.classList.add("button");
	duplicate.innerHTML = "Duplicate";
	duplicate.style.fontSize = 15;
	duplicate.style.left = "26%";
	duplicate.style.position = "relative";
	duplicate.style.width = "29%";
	duplicate.style.top = "-1.1em";
	setupButton(duplicate, 1, 0);
	duplicate.onclick = function() {
		var ext = "." + fname.split(".")[fname.split(".").length - 1];
		var cutfname = fname.substring(0, fname.length - ext.length);
		var num = cutfname.match(/\d+$/) || 1;
		if (num !== 1) {
			cutfname = cutfname.substring(0, cutfname.length - num[0].length);
			num = parseInt(num[0]);
		}
		var files = GET("/api/listfiles").split("\n");
		var dupname = cutfname + num + ext;
		while (files.indexOf(dupname) + 1) {
			num++;
			dupname = cutfname + num + ext;
		}
		POST("/api/copyfile", {"from": fname, "to": dupname});
		removePopup();
		openFile();
	};

	var del = document.createElement("div");
	popup.appendChild(del);
	del.classList.add("button");
	del.onclick = function() { deletePrompt(fname); };
	del.innerHTML = "Delete";
	del.style.fontSize = 15;
	del.style.position = "relative";
	del.style.width = "21%";
	del.style.left = "57%";
	del.style.top = "-3em";
	setupButton(del, 2, 0);

	var okay = document.createElement("div");
	popup.appendChild(okay);
	okay.classList.add("button");
	okay.innerHTML = "OK";
	okay.style.fontSize = 15;
	okay.style.position = "relative";
	okay.style.width = "18%";
	okay.style.left = "80%";
	okay.style.top = "-4.9em";
	setupButton(okay, 3, 0);
	okay.onclick = function() {
		textval = text.value;
		tval = textval.replace(/ /g, "-");
		console.log('--');
		console.log(tval);
		console.log(textval);
		if (tval != fname) {
			var files = GET("/api/listfiles").split("\n");
			if (files.indexOf(tval) != -1) {
				ynPrompt("Overwrite", "Overwrite " + tval, function() {
					POST("/api/copyfile", {"from": fname, "to": tval});
					POST("/api/deletefile", {"file": fname});
					removePopup();
					console.log(textval + " == " + filename);
					if (fname == filename)
						loadFile(textval, true);
					else if (textval == filename) {
						console.log('Loading file');
						loadFile(tval, true);
					}
					openFile();
				},
				function() {
					editFile(fname);
				});
			} else {
				POST("/api/copyfile", {"from": fname, "to": tval});
				POST("/api/deletefile", {"file": fname});
				removePopup();
				if (fname == filename)
						setTitle(textval);
				openFile();
			}
		} else {
			removePopup();
			openFile();
		}
	};

	text.focus();
}

//Caled by the new file button in the open file popup
function newFile() {
	removePopup();
	var fname = "Untitled.py";
	var files = GET("/api/listfiles").split("\n");
	if (files.indexOf(fname) != -1) {
		var i = 1;
		while (files.indexOf("Untitled" + (++i) + ".py") != -1);
		fname = "Untitled" + i + ".py";
	}
	POST("/api/savefile", {"file": fname, "content": ""});
	loadFile(fname);
}

//Loading popup currently non-functional, TODO implement async GET for file operations.
function loading(titletext, bodyText) {
	removePopup();

	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");
	back.focus();

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("filepopup");
	popup.style.height = "60px";
	popup.classList.add("popup");

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.classList.add("maincolor");
	title.style.height = "1.1em";
	title.innerHTML = titletext;

	var text = document.createElement("div");
	popup.appendChild(text);
	text.classList.add("deletetext");
	text.innerHTML = bodyText;
	var i = 0;
	return setInterval(function() {
		text.innerHTML += ".";
		if (++i == 3) {
			text.innerHTML = bodyText;
			i = 0;
		}
	}, 500);
}

//Called when a file div is clicked in the open file popup
function loadFile(fname, override) {
	if (!override)
		var intID = loading("LOADING", "LOADING " + fname);
	if (filename != fname)
		save();
	filename = fname.replace(/ /g, "-");
	type = filename.split(".").reverse()[0];
	if (type == "py")
		editor.setOption("mode", {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		});
	if (type == "sh")
		editor.setOption("mode", "shell");
	setTitle(fname);
	titleText = fname;
	asyncGET("/api/readfile?file=" + filename, function(content) {
		editor.setValue(content);
		if (content == "error") {
			editor.setValue("");
			save(true);
		}
		if (type == "spr") {
			editor.setOption("mode", null);
			var lines = editor.lineCount();
			sprColor({
				from: {line: 0, ch: 0},
				to: {line: lines-1, ch: editor.getLine(lines - 1).length},
				text: "abcd",
			});
		}
		if (changeSocket !== null)
			if (changeSocket.readyState == 1)
				changeSocket.send("COF:" + filename);
			else
				setTimeout(5000, function() { changeSocket.send("COF:" + filename); });
		if (!override) {
			clearInterval(intID);
			removePopup();
		}
		saveButton.src = "/assets/images/savegray.png";
		saveButton.style.cursor = "initial";
		changed = false;
	});
}

//Settings dialog
function settingsDialog() {
	removePopup();

	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");
	back.focus();

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("folderpopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.classList.add("maincolor");
	title.innerHTML = "Settings";

	var fileholder = document.createElement("div");
	popup.appendChild(fileholder);
	fileholder.classList.add("fileholder");

	var ipHolder = document.createElement("div");
	fileholder.appendChild(ipHolder);
	ipHolder.innerHTML = config.ip.split("\n").join("<br>");
	ipHolder.style.height = config.ip.split("\n").length*20 + "px";
	ipHolder.classList.add("newfilebutton");
	ipHolder.classList.add("filetext");
	setupButton(ipHolder, 0, 0);
	var niceNames = themes.map(function(t) {
		return t.replace(/\-/g, " ").split(" ").map(function(e) { return e.substring(0, 1).toUpperCase() + e.substring(1); }).join(" ").replace(/\.css$/, "");
	});

	var buttons = {
		"Change Theme": { type: "list", content: niceNames, func: setTheme},
		"Run this file on boot:": { type: "checkbox", func: function() {
			if (config.bootfiles.indexOf(filename) != -1) {
				config.bootfiles = config.bootfiles.filter(function(x) {return x != filename;});
			} else {
				config.bootfiles.push(filename);
			}
			GET("/api/setbootfiles?files=" + config.bootfiles.join(','));
			console.log(config.bootfiles);
		}},
		"Clean Shutdown": { type: "button", func: function() {
			GET('/api/poweroff');
			removePopup();
		}}
	};

	var j = 0;

	//Populate div
	for (i in buttons) {
		if (buttons[i].type == "button") {
			var button = document.createElement("div");
			fileholder.appendChild(button);
			button.innerHTML = i;
			button.classList.add("filebutton");
			button.onclick = buttons[i];
			setupButton(button, 0, j++);
		} else if (buttons[i].type == "list") {
			var lst = document.createElement("select");
			lst.value = i;
			lst.style.height = "28px";
			lst.addEventListener("change", function() {
				setTheme(lst.value);
			});
			console.log(buttons[i].content);
			for (var j in buttons[i].content) {
				var opt = document.createElement("option");
				if (buttons[i].content[j] == currentTheme)
					opt.selected = "selected";
				lst.appendChild(opt);
				opt.innerHTML = buttons[i].content[j];
			}
			fileholder.appendChild(lst);
			lst.classList.add("filebutton");
			lst.onclick = buttons[i];
		} else if (buttons[i].type == "checkbox") {
			var button = document.createElement("div");
			var box = document.createElement("input");
			box.type = "checkbox";
			box.style.float = "right";
			box.onclick = buttons[i].func;
			if (config.bootfiles.indexOf(filename) != -1)
				box.checked = true;
			fileholder.appendChild(button);
			button.innerHTML = i;
			button.appendChild(box);
			button.classList.add("checkboxdiv");
			setupButton(box, 0, j++);
		}
	}

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	setupButton(cancel, 0, j);
	cancel.innerHTML = "Close";
	cancel.classList.add("button");
	cancel.style.position = "relative";
	cancel.style.marginTop = "-5px";
	cancel.style.width = "25%";
	cancel.style.left = "37.5%";
	cancel.onclick = removePopup;
}

//Open file popup
function openFile(button) {
	var loopID = loading("Loading", "Generating file list");
	asyncGET("api/listfiles", function(response) {
		console.log(response);
		if (button)
			save();
		clearInterval(loopID);
		removePopup();
		back = document.createElement("div");
		document.body.appendChild(back);
		back.classList.add("holder");
		back.focus();

		popup = document.createElement("div");
		document.body.appendChild(popup);
		popup.classList.add("folderpopup");
		popup.classList.add("popup");
		back.onclick = removePopup;

		var title = document.createElement("h1");
		popup.appendChild(title);
		title.classList.add("popuptitle");
		title.classList.add("maincolor");
		title.innerHTML = "Select File";

		var fileholder = document.createElement("div");
		popup.appendChild(fileholder);
		fileholder.classList.add("fileholder");

		var newfile = document.createElement("div");
		fileholder.appendChild(newfile);
		newfile.innerHTML = "-- New File --";
		newfile.classList.add("newfilebutton");
		newfile.classList.add("filebutton");
		newfile.onclick = newFile;
		setupButton(newfile, 0, 0);

		console.log("'" + response + "'");

		var files = response.split("\n");
		//Force lower capitalized files to their correct sort position
		var caps = [];
		for (var i in files) {
			if (files[i].substring(0, 1) == files[i].substring(0, 1).toUpperCase()) {
				caps = caps.concat(files[i]);
				files[i] = files[i].toLowerCase()+"_;";
			}
		}
		files.sort();
		for (i in caps) {
			var index = files.indexOf(caps[i].toLowerCase()+"_;");
			files[index] = caps[i];
		}
		//Populate div
		if (response)
			for (i in files) {
				var filediv = document.createElement("div");
				fileholder.appendChild(filediv);
				filediv.innerHTML = files[i].replace(/-/g, " ");
				filediv.classList.add("filebutton");
				filediv.onclick = function() {
					loadFile(this.innerHTML);
				};
				setupButton(filediv, 0, parseInt(i) + 1);
				var pencilDiv = document.createElement("img");
				fileholder.appendChild(pencilDiv);
				pencilDiv.src = "/assets/images/pencil.png";
				pencilDiv.classList.add("pencilbutton");
				pencilDiv.draggable = false;
				setupButton(pencilDiv, 1, parseInt(i) + 1);
				pencilDiv.onclick = new Function("editFile(\""+files[i]+"\")");
			}

		var cancel = document.createElement("div");
		popup.appendChild(cancel);
		setupButton(cancel, 0, files.length + 1);
		cancel.innerHTML = "Close";
		cancel.classList.add("button");
		cancel.style.position = "relative";
		cancel.style.marginTop = "-5px";
		cancel.style.width = "25%";
		cancel.style.left = "37.5%";
		cancel.onclick = removePopup;
	});
}

//Called when a div is clicked in the change theme function
function setTheme(name) {
	currentTheme = name;
	name = name.toLowerCase().replace(/ /g, "-");
	document.getElementById("theme").href = "/assets/themes/" + name + ".css";
	old = editor.getOption("theme");
	editor.setOption("theme", name);
	output.classList.remove("cm-s-"+old);
	output.classList.add("cm-s-"+name);
	//settingsDialog();
}

outputOpen = true;
function toggleOutput() {
	var button = document.getElementById("outputbutton");
	outputOpen = !outputOpen;
	if (!outputOpen) {
		outputPos = outputHolder.scrollTop;
		button.src = "/assets/images/arrow-up.png";
		output.classList.remove("outputOpen");
		output.classList.add("outputClosed");
		codewrapper.classList.remove("codeShort");
		codewrapper.classList.add("codeLong");
		setTimeout(function() { ide.scrollIntoViewIfNeeded(); }, 10);
	} else {
		button.src = "/assets/images/arrow-down.png";
		output.classList.remove("outputClosed");
		output.classList.add("outputOpen");
		codewrapper.classList.remove("codeLong");
		codewrapper.classList.add("codeShort");
		editor.focus();
		outputHolder.scrollTop = outputPos;
	}
}

function welcome() {
	var dis = window.localStorage.getItem('disableWelcome');
	console.log(dis);
	console.log(dis == "false");
	if (!dis || dis == "false") {
		removePopup();

		back = document.createElement("div");
		document.body.appendChild(back);
		back.classList.add("holder");
		back.focus();

		popup = document.createElement("div");
		document.body.appendChild(popup);
		popup.classList.add("folderpopup");
		popup.classList.add("popup");
		back.onclick = removePopup;

		var title = document.createElement("h1");
		popup.appendChild(title);
		title.classList.add("popuptitle");
		title.classList.add("maincolor");
		title.innerHTML = "Welcome";

		var text = document.createElement("div");
		popup.appendChild(text);
		text.classList.add("welcomeText");
		text.innerHTML = config.welcome.replace(/\\n/g, "<br>");

		var showLabel = document.createElement("div");
		showLabel.innerHTML = "Don't show again";
		popup.appendChild(showLabel);
		showLabel.style.position = "relative";
		showLabel.style.fontWeight = "500";
		showLabel.style.fontSize = "0.8em";
		showLabel.style.left = "70%";
		showLabel.style.marginTop = "-24px";
		showLabel.style.zIndex = 7;

		var show = document.createElement("input");
		show.type = "checkbox";
		popup.appendChild(show);
		show.style.position = "relative";
		show.style.left = "94%";
		show.style.marginTop = "-12px";
		show.style.zIndex = 7;
		var on = false;
		show.onchange = function() {
			on = !on;
			console.log(on);
			window.localStorage.setItem('disableWelcome', on);
		};

		var cancel = document.createElement("div");
		popup.appendChild(cancel);
		setupButton(cancel, 0, 0);
		cancel.innerHTML = "Close";
		cancel.classList.add("button");
		cancel.style.position = "relative";
		cancel.style.marginTop = "-26px";
		cancel.style.width = "25%";
		cancel.style.left = "37.5%";
		cancel.onclick = removePopup;
		cancel.style.zIndex = 7;
	}
}

function outFocus() {
	if (ws === null)
		editor.focus();
	else
		stdin.focus();
}
