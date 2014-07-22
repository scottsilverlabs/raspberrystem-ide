var codewrapper, output, ide, editor, web, titleHolder, playButton, save, GET, POST, filename, type, sprColor;
//The URL is needed for the web socket connection
var url = document.location.host;
window.onload = function main() {
	codewrapper = document.getElementById("codewrapper");
	output = document.getElementById("output");
	outputtext = document.getElementById("output").firstChild;
	ide = document.getElementById("ide");
	web = document.getElementById("webview");
	if (url != "127.0.0.1" && url != "localhost") {
		document.getElementById("browser").parentNode.removeChild(document.getElementById("browser"));
	}
	playButton = document.getElementById("play");
	titleHolder = document.getElementById("title");
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
	});
	themes = editor.options.theme.split(" ");
	for (var i in themes) {
		output.classList.add("cm-s-"+themes[i]);
	}
	editor.setValue("#!/usr/bin/env python3\n");
	editor.on("change", sprColor);
};

window.onbeforeunload = function (event) {
	console.log(event);
	POST("/api/userleave");
	save();
};

function usercheck() {
	var users = GET("/api/usernumber?file="+filename);
	if (parseInt(users) >= 2) {
		titleHolder.innerHTML = titleHolder.innerHTML.split("(")[0]+"("+users+" Users In This File)";
	} else {
		titleHolder.innerHTML = titleHolder.innerHTML.split("(")[0];
	}
}

setInterval(usercheck, 10000);

String.prototype.capitalize = function() {
	var arr = this.split(" ");
	var toRet = "";
	for (var i in arr) {
		toRet += " "+arr[i].charAt(0).toUpperCase() + arr[i].slice(1);
	}
    return toRet.substring(1);
};

String.prototype.lower = function() {
    return this.toLowerCase();
};

function GET(url) {  
	var req = new XMLHttpRequest();
	req.open("GET", url, false);
	req.send(null);
	return req.responseText;
}

function POST(url, args) {  
	argsActual = "";
	for (var i in args) {
		argsActual += "&"+i+"="+encodeURIComponent(args[i]);
	}
	argsActual = argsActual.substring(1);
	var req = new XMLHttpRequest();
	req.open("POST", url, false);
	req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	req.send(argsActual);
	return req.responseText;
}

var filename = "Untitled.py";
function save() {
	if (filename !== "") {
		POST("/api/savefile", {"file": filename, "content": editor.getValue()});
	}
}

//Called when the script stops running on the server side

var errs = [];
var errRegex = new RegExp(/[ ]+File "\/projects\/.+", line \d+\n.+\n.+\^\n.+: .+/g);
var traceRegex = new RegExp(/[ ]+File "\/projects\/.+", line \d+, in.+\n.+\n.+: .+/g);
var stripRegex = new RegExp(/(^\s+|\s+$)/g);
function errorHighlight() {
	var errString = outputtext.innerHTML;
	var lines = errString.split("\n");
	var errors = errString.match(errRegex);
	for (var i in errors) {
		var err = errors[i];
		var errLines = err.split("\n");
		var errLinePos = errLines[0].split(", ")[1].substring(5);
		var line = editor.lineInfo(errLinePos-1);
		var stripped = errLines[1].replace(stripRegex, "");
		var match = line.text.indexOf(stripped);
		var start = {"line": errLinePos-1, "ch": match};
		var end = {"line": errLinePos-1, "ch": match+stripped.length};
		errs.push(editor.markText(start, end, {
			className: "cm-error",
			clearOnEnter: true,
			title: errLines[3],
		}));
		if (i === 0) {
			editor.scrollTo(0, errLinePos);
		}
	}
	var traces = errString.match(traceRegex);
	console.log(traces);
	for (i in traces) {
		err = traces[i];
		errLines = err.split("\n");
		errLinePos = errLines[0].split(", ")[1].substring(5);
		line = editor.lineInfo(errLinePos-1);
		stripped = errLines[1].replace(stripRegex, "");
		match = line.text.indexOf(stripped);
		start = {"line": errLinePos-1, "ch": match};
		end = {"line": errLinePos-1, "ch": match+stripped.length};
		errs.push(editor.markText(start, end, {
			className: "cm-error",
			clearOnEnter: true,
			title: errLines[2],
		}));
		if (i == 0) {
			editor.scrollTo(0, errLinePos);
		}
	}
	console.log(errs);
}

function sprColorAll() {
	for (var i = 0; i < editor.lineCount(); i++) {
		var line = editor.getLine(i);
		for (var j = 0; j < line.length; j++) {
			var ch = line.substring(j, j+1).toLowerCase();
			var code = ch.charCodeAt(0);
			var start = {"line": i, "ch": j};
			var end = {"line": i, "ch": j+1};
			if ((parseInt(ch) && ch !== 0 ) || (code < 103 && code > 96)) {
				editor.markText(start, end, {
					className: "spr"+ch,
				});
			} else if (ch != "-" && ch != " " && ch != "0") {
				editor.markText(start, end, {
					className: "sprerr",
				});
			}
		}
	}
}

function sprColor(cm, change) {
	if (type == "spr") {
		var baseline = change.from.line;
		var ldiff = change.to.line - change.from.line;
		for (var i = 0; i <= ldiff; i++) {
			var line = editor.getLine(baseline+i);
			var schar = 0;
			var echar = line.length;
			if (i === 0) {
				schar = change.from.ch;
			} else if (i == ldiff) {
				echar = change.to.ch;
			}
			for (var j = schar; j < echar; j++) {
				var ch = line.substring(j, j+1).toLowerCase();
				var code = ch.charCodeAt(0);
				var start = {"line": baseline+i, "ch": j};
				var end = {"line": baseline+i, "ch": j+1};
				if ((parseInt(ch) && ch !== 0 ) || (code < 103 && code > 96)) {
					editor.markText(start, end, {
						className: "spr"+ch,
					});
				} else if (ch != "-" && ch != " " && ch != "0") {
					editor.markText(start, end, {
						className: "sprerr",
					});
				}
			}
		}
	}
}

//Creates socket connection to the server and sends the filename
var ws = null;
function socket() {
	ws = new WebSocket("ws://"+url+"/api/socket");
	ws.onopen = function (event) {
		while ((a = errs.pop()) !== undefined) {
			console.log(a);
			a.clear();
		}
		ws.send(filename);
		playButton.src = "/images/stop.png";
	};
	ws.onclose = function (event) {
		console.log("Close");
		ws = null;
		errorHighlight();
		playButton.src = "/images/play.png";
	};
	ws.onmessage = function (event) {
		message = event.data;
		if (message.substring(0, 8) == "output: ") {
			messageActual = message.substring(8).replace(/</g, "&lt;").replace(/>/g, "&gt;");
			outputtext.innerHTML += messageActual;
			output.scrollTop = output.scrollHeight;
			return;
		} else if (message.substring(0, 7) == "error: ") {
			messageActual = message.substring(7).replace(/</g, "&lt;").replace(/>/g, "&gt;");
			outputtext.innerHTML += "<span style=\"color:red;\">SERVER ERROR:";
			outputtext.innerHTML += messageActual;
			outputtext.innerHTML += "</span>\n";
			output.scrollTop = output.scrollHeight;
		}
	};
}

//Called by the run button
function run() {
	if (ws === null){
		save();
		outputtext.innerHTML = "";
		if (type != "spr") {
			socket();
		}
	} else {
		ws.send("close");
	}
}

//Called by the web button
var webShowing = false;
function toggleWeb() {
	webShowing = !webShowing;
	if (webShowing){
		codewrapper.style.width = "50%";
		output.style.width = "50%";
		web.style.width = "50%";
		web.style.left = "50%";
	} else {
		codewrapper.style.width = "100%";
		output.style.width = "100%";
		web.style.width = "0";
		web.style.left = "100%";
	}
}

//Removes popups
var back, popup, text, menu;
function removePopup() {
	back.parentNode.removeChild(back);
	popup.parentNode.removeChild(popup);
}

//Called when the newFile okay button is pressed
function fileButton() {
	type = menu.value;
	titleHolder.innerHTML = text.value + "." + type;
	filename = titleHolder.innerHTML.replace(/ /g, "-");
	if (type === "py") {
		editor.setOption("mode", {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		});
		editor.setValue("#!/usr/bin/env python3\n");
	} else if (type === "spr") {
		var val = "\n- - - - - - - -";
		for (var i = 0; i < 3; i++) {
			val = val+val;
		}
		editor.setValue(val.substring(1));
		editor.setOption("mode", null);
	} else if (type === "sh") {
		editor.setValue("#!/bin/bash\n");
		editor.setOption("mode", "shell");
	}
	removePopup();
}

//Caled by the new file button in the open file popup
function newFile() {
	removePopup();
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("filepopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.classList.add("maincolor");
	title.innerHTML = "New File";

	text = document.createElement("input");
	popup.appendChild(text);
	text.classList.add("filetext");
	text.type = "text";

	menu = document.createElement("select");
	popup.appendChild(menu);
	menu.classList.add("filetype");
	menu.innerHTML = '<option value="py">.py</option>';
	menu.innerHTML += '<option value="spr">.spr</option>';
	menu.innerHTML += '<option value="sh">.sh</option>';

	var okay = document.createElement("div");
	popup.appendChild(okay);
	okay.classList.add("fileokay");
	okay.onclick = fileButton;
	okay.innerHTML = "Save";

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("filecancel");
	cancel.onclick = removePopup;
}

//Called when a file div is clicked in the open file popup
function loadFile(div) {
	if (filename != div.innerHTML) {
		save();
	}
	filename = div.innerHTML.replace(/ /g, "-");
	var sp = filename.split(".");
	type = sp[sp.length-1];
	if (type == "py") {
		editor.setOption("mode", {
			name: "python",
			version: 3,
			singleLineStringErrors: false
		});
	}
	if (type == "sh") {
		editor.setOption("mode", "shell");
	}
	titleHolder.innerHTML = div.innerHTML;
	var contents = GET("/api/readfile?file="+filename);
	editor.setValue(contents);
	if (type == "spr") {
		editor.setOption("mode", null);
		sprColorAll();
	}
	removePopup();
	usercheck();
}

//Called by the open file button
function openFile() {
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");

	popup = document.createElement("div");
	document.body.appendChild(popup);
	popup.classList.add("folderpopup");
	popup.classList.add("popup");
	back.onclick = removePopup;

	var title = document.createElement("h1");
	popup.appendChild(title);
	title.classList.add("popuptitle");
	title.classList.add("maincolor");
	title.innerHTML = "Open File";

	var fileholder = document.createElement("div");
	popup.appendChild(fileholder);
	fileholder.classList.add("fileholder");

	//Files
	files = GET("/api/listfiles").split("\n");
	if (files[0] === "") {
		//TODO No Files Found Error
	} else {
		for (var i in files) {
			var filediv = document.createElement("div");
			fileholder.appendChild(filediv);
			filediv.innerHTML = files[i].replace(/-/g, " ");
			filediv.classList.add("filediv");
			filediv.classList.add("maincolor");
			filediv.onclick = new Function("loadFile(this)");
		}
	}

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("foldercancel");
	cancel.onclick = removePopup;

	var newfile = document.createElement("div");
	popup.appendChild(newfile);
	newfile.innerHTML = "New";
	newfile.classList.add("foldernew");
	newfile.onclick = newFile;
}

//Called when a div is clicked in the change theme function
function setTheme(obj) {
	name = obj.innerHTML.lower().replace(/ /g, "-");
	document.getElementById("theme").href = "/themes/"+name+".css";
	old = editor.getOption("theme");
	editor.setOption("theme", name);
	output.classList.remove("cm-s-"+old);
	output.classList.add("cm-s-"+name);
	removePopup();
}

//Called by the change theme button
function changeTheme() {
	back = document.createElement("div");
	document.body.appendChild(back);
	back.classList.add("holder");

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
	if (files[0] === "") {
		//TODO No Files Found Error
	} else {
		for (var i in files) {
			var filediv = document.createElement("div");
			fileholder.appendChild(filediv);
			filediv.innerHTML = files[i].replace(/-/g, " ").replace(/\.css/g, "").capitalize();
			filediv.classList.add("filediv");
			filediv.classList.add("maincolor");
			filediv.onclick = new Function("setTheme(this)");
		}
	}

	var cancel = document.createElement("div");
	popup.appendChild(cancel);
	cancel.innerHTML = "Cancel";
	cancel.classList.add("foldercancel");
	cancel.onclick = removePopup;
}