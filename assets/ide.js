var run, save, GET, POST, changeHandle, changeSocket, openFile, removePopup,
	changeSocketInit, toggleOutput, toggleWeb, changeTheme; //Function prototypes
var config, outputOpen, back, ws = null, titleText, filename, type;
var bindableFunc = ["save", "run", "toggleWeb", "toggleOutput", "changeTheme",
	"openFile"];
var leftButtons = ["Run", "Open File", "Save", "Theme"];
var keybindings = {};

window.onload = function main() {
	if (window.MozWebSocket)
		window.WebSocket = window.MozWebSocket;
	if (document.location.host == "127.0.0.1")
		document.getElementById("outputbutton").src = "/images/arrow-down.png"
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
	}
	playButton = document.getElementById("play");
	saveButton = document.getElementById("save");
	saveButton.onclick = save;
	ide = document.getElementById("ide");
	web = document.getElementById("webview");
	titleHolder = document.getElementById("title");
	config = JSON.parse(GET("/api/configuration"));
	editor = CodeMirror(document.getElementById("codewrapper"), {
		mode: {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		},
		autofocus: true,
		lineNumbers: true,
		undoDepth: 20, //Default: 40
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
	themes = editor.options.theme.split(" ");
	for (var i in themes)
		output.classList.add("cm-s-"+themes[i]);
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
		for (i in leftButtons) {
			var label = document.createElement("div");
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
	for (i in config) {
		var func = config[i].substring(0, 1).toLowerCase() + config[i].substring(1);
		if (bindableFunc.indexOf(func) + 1) {
			keybindings[i] = new Function(func + "()");
		}
	}
	if (GET("/api/listfiles").split("\n")[0] === "")
		save(); //Create untitled document
	loadFile(filename);
};

window.onbeforeunload = function() {
	save();
	changeSocket.close();
};

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
		k.preventDefault();
		keybindings[keyseq]();
		return false;
	}
}

//Called when the header is clicked
function headerClick() {
	if (back == null)
		editor.focus();
}

function setTitle(text) {
	titleHolder.innerHTML = text;
	titleHolder.style.width = (titleHolder.innerHTML.length * 0.6) + "em";
}

var currButton;
function unhover() {
	if (currButton)
		currButton.className = currButton.className.replace("_hover", "");
}

function hover(button) {
	if (back == null) return;
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
var types = ["py", "spr", "sh"]
//Up/Down keys
function updown(dir) {
	if (back == null) return; //Check for popup
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
	if (back == null) return;
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
	if (back == null) return;
	var button = document.getElementById("Button"+place[0]+","+place[1]);
	if (button)
		button.click();
}

//Handle generic keys
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

function GET(url) {  
	var req = new XMLHttpRequest();
	req.open("GET", url, false);
	req.send(null);
	return req.responseText;
}

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

function save() {
	if (filename !== "")
		POST("/api/savefile", {"file": filename, "content": editor.getValue()});
}

var linepos = 0; //Used for tracking \r position
function setOutput(text) {
	outputText.innerHTML = text;
	stdin.scrollIntoViewIfNeeded();
}

//Appends to output and handles \r and \f
function appendOutput(text) {
	//text = text.replace(/\r\n/g, "\n"); 
	var lines = outputText.innerHTML.split("\n");
	var lastline = lines.pop();
	var content;
	if (lines.length > 1)
		content = lines.join("\n") + "\n";
	else if (lines.length == 1)
		content = lines[0] + "\n";
	else
		content = "";
	var i = 0;
	while (i < text.length) {
		var chr = text.substring(i, i + 1);
		i++;
		if (chr == "\r") {
			console.log("\\r:"+i)
			linepos = 0;
		} else if (chr == "\f") {
			lastline = "";
			content = "";
			linepos = 0;
		} else if (chr == "\n") {
			content += lastline + "\n";
			lastline = "";
			linepos = 0;
		} else {
			lastline = lastline.substring(0, linepos) + chr + lastline.substring(linepos + 1);
			linepos++;
		}
	}
	setOutput(content + lastline);
}


//Called when the script stops running on the server side
var errs = [];
var errRegex = new RegExp(/\s+File ".+", line \d+.*\n.+\n.+\^\n.+: .+/g);
var traceRegex = new RegExp(/Traceback.*:\n(\s+File ".+", line \d+.*\n.*\n)+.*(Error|Interrupt|Exception).*/g);
var stripRegex = new RegExp(/(^\s+|\s+$)/g);
function errorHighlight() {
	var errString = outputText.innerHTML;
	var lines = errString.split("\n");
	var errors = errString.match(errRegex) || [];
	var offset = 0;
	if (editor.lineInfo(0).text.substring(0, 2) != "#!")
		offset = 1;
	for (var i in errors) {
		var err = errors[i];
		var errLines = err.split("\n");
		var errLinePos = errLines[0].split(", ")[1].substring(5);
		var line = editor.lineInfo(errLinePos - 1 - offset);
		var stripped = errLines[1].replace(stripRegex, "");
		var match = line.text.indexOf(stripped);
		var start = {"line": errLinePos-1, "ch": match};
		var end = {"line": errLinePos-1, "ch": match+stripped.length};
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
		for (var i = 1; i < split.length-1; i++) {
			var line = split[i];
			if (i%2 !== 0) {
				var end = 0;
				for (var k = 8; k < line.length; k++)
					if (line.substr(k, 1) == "\"")
						end = k;
				message += "\n"+line.substring(0, 8) + "<span class=\"cm-variable\">"
					+line.substring(8, end) + "</span>";
				var nextend = end+8;
				while (parseInt(line.substr(nextend, 1)) || line.substr(nextend, 1) == "0")
					nextend++;
				message += line.substring(end, end+8) + "<span class=\"cm-variable\">"
					+ line.substring(end+8, nextend) + "</span>" + line.substring(nextend);
				if (line.substring(end-filename.length, end) == filename) {
					var lnum = parseInt(line.substring(end + 8, nextend)) - 1 - offset;
					var start = {"line": lnum, "ch": 0};
					var end = {"line": lnum, "ch": editor.getLine(lnum).length};
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
		message += "\n"+split[split.length - 1]
		setOutput(outputText.innerHTML.replace(traces[j], 
			"<span style=\"color:red;\">" + message + "</span>"));
	}
}

function sprColor(change) {
	var baseline = change.from.line;
	var ldiff = change.to.line - change.from.line;
	if (ldiff == 0 && change.text.length == 2) {
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

var last = null;
function changeHandle(cm, change) {
	if (type == "spr")
		sprColor(change);
	if (changeSocket !== null && last === null && change.origin != "setValue") {
		var text = "";
		for (var i in change.text)
			text += "\n"+change.text[i];
		changeSocket.send("CIF:" + change.from.line + "," + change.from.ch + ","
			+ change.to.line + "," + change.to.ch + "," + text.substring(1));
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
		setTitle(titleText);
	};
	ws.onclose = function(event) {
		ws = null;
		errorHighlight();
		playButton.src = "/images/play.png";
		setTitle(titleText);
		stdin.style.width = "0";
		//Remove trailing \n
		var innerHTML = outputText.innerHTML;
		if (innerHTML.substring(innerHTML.length - 1) == "\n")
			setOutput(innerHTML.substring(0, innerHTML.length - 1));
		editor.focus();
	};
	ws.onmessage = function(event) {
		message = event.data;
		if (message == "started") {
			clearInterval(loopID);
			setTitle("RUNNING");
		}
		if (message.substring(0, 8) == "output: ") {
			if (!outputOpen)
				toggleOutput();
			appendOutput(message.substring(8).replace(/</g, "&lt;")
				.replace(/>/g, "&gt;"));
			return;
		} else if (message.substring(0, 7) == "error: ") {
			if (!outputOpen)
				toggleOutput();
			messageActual = message.substring(7).replace(/</g, "&lt;")
				.replace(/>/g, "&gt;");
			appendOutput("<span style=\"color:red;\">SERVER ERROR:" + messageActual +
				"</span>\n");
		}
	};
}

function changeSocketInit() {
	changeSocket = new WebSocket("ws://"+document.location.host+"/api/change");
	changeSocket.onopen = function (event) {
		changeSocket.send("COF:"+filename);
		good = true;
	};
	changeSocket.onclose = function (event) {
		changeSocket = null;
		if (good)
			setTimeout(5000, changeSocketInit);
	};
	changeSocket.onerror = function (event) {
		if (!good)
			alert("Your browser may not support web sockets\nFor the best experience use Google Chrome");
	};
	changeSocket.onmessage = function (event) {
		message = event.data;
		if (message == "FILE") {
			var pos = editor.getCursor();
			changeSocket.send("FILE:"+editor.getValue());
			editor.setCursor(pos);
		} else if (message.substring(0, 5) == "FILE:") {
			editor.setValue(message.substring(5));
		} else if (message.substring(0, 6) == "USERS:") {
			var num = parseInt(message.substring(6));
			if (num > 1)
				setTitle(titleText + " - " + num + " Users");
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
			if (line[j] !== "" && (line[j].match(sprColorRegex) === null
				|| line[j].match(sprColorRegex)[0] != line[j])) {
				appendOutput("<span style=\"color:red;\">ERROR at line "
					 + (parseInt(i)+1)+": invalid color \""+line[j]+"\"");
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
		save();
		linepos = 0;
		outputText.innerHTML = "";
		if (type != "spr") {
			socket();
			//Override the editor.focus() from the header click
			stdin.style.width = "100%";
			var i = 0;
			setTitle("STARTING");
			playButton.src = "/images/stop.png";
			loopID = setInterval(function() {
				setTitle(title.innerHTML + ".");
				if (++i == 3) {
					i = 0;
					setTitle("STARTING");
				}
			}, 500)
			setTimeout(function() { stdin.focus() }, 10);
		} else {
			runSpr();
		}
	} else {
		ws.send("close");
	}
	editor.focus();
}

//Called by the web button
var webShowing = false;
function toggleWeb() {
	var button = document.getElementById("webbutton");
	webShowing = !webShowing;
	if (webShowing) {
		if (document.location.host == "127.0.0.1")
			button.src = "/images/arrow-right.png"
		else
			button.style.transform = "rotateY(0deg)";
		title.className = "headertextRight"; //classList.remove wasn't working in chromium
		ide.style.width = "50%";
		web.style.width = "50%";
		web.style.left = "50%";
	} else {
		if (document.location.host == "127.0.0.1")
			button.src = "/images/arrow-left.png"
		else
			button.style.transform = "rotateY(180deg)";
		title.className = "headertextCenter";
		ide.style.width = "100%";
		web.style.width = "0";
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

//Called by delete in the Edit File prompt
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
	text.value = fname;

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
		POST("/api/copyfile", {"from": fname, "to": dupname})
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
		tval = text.value.replace(/ /g, "-")
		if (tval != fname) {
			var files = GET("/api/listfiles").split("\n");
			if (files.indexOf(tval) != -1) {
				ynPrompt("Overwrite", "Overwrite " + tval, function() {
					POST("/api/copyfile", {"from": fname, "to": tval})
					POST("/api/deletefile", {"file": fname})
					removePopup();
					openFile();
				},
				function() {
					editFile(fname);
				})
			} else {
				POST("/api/copyfile", {"from": fname, "to": tval})
				POST("/api/deletefile", {"file": fname})
				removePopup();
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
		while (files.indexOf("Untitled"+(++i)+".py") != -1);
		fname = "Untitled"+i+".py"
	}
	POST("/api/savefile", {"file": fname, "content": ""});
	openFile();
}

function loading(titletext, bodyText) {
	removePopup();

	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");
	back.focus();

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("filepopup");
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
	return 0;
	return setInterval(function() {
		text.innerHTML += ".";
		if (++i == 3) {
			text.innerHTML = bodyText;
			i = 0;
		}
	}, 500);
}

//Called when a file div is clicked in the open file popup
function loadFile(fname) {
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
	var contents = GET("/api/readfile?file=" + filename);
	editor.setValue(contents);
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
	clearInterval(intID);
	removePopup();
}

//Open file popup
function openFile(button) {
	if (back != null)
		removePopup();
	if (button)
		save();
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

	var files = GET("/api/listfiles").split("\n");
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
		pencilDiv.src = "/images/pencil.png";
		pencilDiv.classList.add("pencilbutton");
		pencilDiv.draggable = false;
		setupButton(pencilDiv, 1, parseInt(i) + 1);
		pencilDiv.onclick = new Function("editFile(\""+files[i]+"\")");
	}

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	setupButton(cancel, 0, files.length + 1);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("button");
	cancel.style.position = "relative";
	cancel.style.marginTop = "-5px";
	cancel.style.width = "25%";
	cancel.style.left = "37.5%";
	cancel.onclick = removePopup;
}

//Called when a div is clicked in the change theme function
function setTheme(obj) {
	name = obj.innerHTML.toLowerCase().replace(/ /g, "-");
	document.getElementById("theme").href = "/themes/"+name+".css";
	old = editor.getOption("theme");
	editor.setOption("theme", name);
	output.classList.remove("cm-s-"+old);
	output.classList.add("cm-s-"+name);
	removePopup();
}

//Called by the change theme button
function changeTheme() {
	if (back != null)
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
	title.innerHTML = "Select Theme";

	var fileholder = document.createElement("div");
	popup.appendChild(fileholder);
	fileholder.classList.add("fileholder");

	//Files
	files = GET("/api/listthemes").split("\n");
	for (var i in files) {
		var filediv = document.createElement("div");
		fileholder.appendChild(filediv);
		filediv.innerHTML = files[i].replace(/-/g, " ").replace(/\.css/g, "");
		filediv.classList.add("filebutton");
		if (i == 0)
			filediv.style.marginTop = "0";
		setupButton(filediv, 0, i);
		filediv.onclick = function() { setTheme(this); };
	}

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("button");
	cancel.style.position = "relative";
	cancel.style.marginTop = "-5px";
	cancel.style.width = "25%";
	cancel.style.left = "37.5%";
	cancel.onclick = removePopup;
}

outputOpen = true;
function toggleOutput() {
	var button = document.getElementById("outputbutton");
	if (outputOpen) {
		if (document.location.host == "127.0.0.1")
			button.src = "/images/arrow-up.png"
		else
			button.style.transform = "rotateZ(-90deg)";
		button.style.marginTop = "-5em";
		output.classList.remove("outputOpen");
		output.classList.add("outputClosed");
		codewrapper.classList.remove("codeShort");
		codewrapper.classList.add("codeLong");
	} else {
		if (document.location.host == "127.0.0.1")
			button.src = "/images/arrow-down.png"
		else
			button.style.transform = "rotateZ(90deg)";
		button.style.marginTop = "-3em";
		output.classList.remove("outputClosed");
		output.classList.add("outputOpen");
		codewrapper.classList.remove("codeLong");
		codewrapper.classList.add("codeShort");
	}
	outputOpen = !outputOpen;
	editor.focus();
}

function outFocus() {
	if (ws == null)
		editor.focus();
	else
		stdin.focus();
}
