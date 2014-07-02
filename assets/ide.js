//TODO:
//Improve the UI and UX
//Linting?
//Optimize CM
//Custom colors and themes?
//Setup pi image to boot into X with midori -e Fullscreen -a http://127.0.0.1?
var codewrapper, output, ide, editor, web, titleHolder, playButton;
//The URL is needed for the web socket connection
var url = document.baseURI.match(/\/\/[a-zA-Z0-9\.]+/)[0].substring(2);
window.onload = function main() {
	codewrapper = document.getElementById("codewrapper");
	output = document.getElementById("output");
	outputtext = document.getElementById("output").firstChild;
	ide = document.getElementById("ide");
	web = document.getElementById("webview");
	if (document.location.host != "127.0.0.1" && document.location.host != "localhost") {
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
		indentUnit: 4,
		matchBrackets: true,
		theme: "solarized-dark",
		textWrapping: true,
	});
	themes = editor.options.theme.split(" ");
	for (var i in themes) {
		output.classList.add("cm-s-"+themes[i]);
	}
};

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

function run() {
	if (ws === null){
		save();
		outputtext.innerHTML = "";
		socket();
	} else {
		ws.send("close");
	}
}

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

var back, popup, text;
function removePopup() {
	back.parentNode.removeChild(back);
	popup.parentNode.removeChild(popup);
}

//Called when the newFile okay button is pressed
function fileButton() {
	titleHolder.innerHTML = text.value;
	filename = text.value.replace(/ /g, "-").replace(/\.py/g, "") + ".py";
	removePopup();
}

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

function loadFile(div) {
	filename = div.innerHTML.replace(/ /g, "-")+".py";
	titleHolder.innerHTML = div.innerHTML;
	contents = GET("/api/readfile?file="+filename);
	editor.setValue(contents);
	removePopup();
}

function openFile() {
	save();
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
			filediv.innerHTML = files[i].replace(/-/g, " ").replace(/\.py/g, "");
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

function setTheme(obj) {
	name = obj.innerHTML.lower().replace(/ /g, "-");
	document.getElementById("theme").href = "/themes/"+name+".css";
	old = editor.getOption("theme");
	editor.setOption("theme", name);
	output.classList.remove("cm-s-"+old);
	output.classList.add("cm-s-"+name);
	removePopup();
}

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