var posts = [];
var cellurls = {};
var cellimageurls = {};
var diffImage = "https://encrypted-tbn2.gstatic.com/images?q=tbn:ANd9GcSZCilIMSKaiiLs6gE0RwLWlIIBLkYsSKlRXhu1ZbGIprGrdh9BMFK-Bg";
var rateImage = "http://icongal.com/gallery/image/144117/nintendo_star.png";
var headerStyle = "width:"+(100/6)+"%;display:inline;";

var title = document.getElementById("content").firstElementChild.firstElementChild;
title.firstElementChild.innerHTML += "<span id=\"count\">("+posts.length+")</span>";
var count = document.getElementById("count");
var content = document.getElementById("content").firstElementChild.getElementsByTagName("div")[0];
var bar = document.getElementById("tablesearchbar");
content.innerHTML += "<div id=\"projectTable\" class=\"tableheader\"></div>";
var table = document.getElementById("projectTable");
var header = "<style> .entry-title {margin-bottom:0;} ";
header += ".descout {height:100%;padding-bottom:1em;padding-top:1em;}";
header += ".descin {height:0px;padding-bottom:0px;padding-top:0px;}";
header += ".down {-webkit-transform:rotate(180deg);-moz-transform:rotate(180deg);-ms-transform:rotate(180deg)}";
header += ".up {-webkit-transform:rotate(0deg);-moz-transform:rotate(0deg);-ms-transform:rotate(0deg)}";
header += ".gray {-webkit-filter:grayscale(100%);-moz-filter:grayscale(100%);-ms-filter:grayscale(100%);-o-filter:grayscale(100%);filter:grayscale(100%);filter:url(GRAYSCALEURL);} </style>";
header += "<div id=\"advsearch\" class=\"in\" style=\"width:100%;overflow:hidden;display:inline-flex;display:-webkit-inline-box;\"></div>";
header += "<input id=\"tablesearchbar\" style=\"float:left;width:99%;max-height:1em;overflow-x:auto;overflow-y:hidden;display:inline;\" class=\"headerbutton\" type=\"text\" value=\"\" placeholder=\"Search\" onchange=\"search(this.value)\"/>";
header += "<div class=\"tableheader\" style=\"display:inline;width:100%;text-align:center;white-space:nowrap;\">";
header += "<input style=\""+headerStyle+"\" class=\"headerbutton\" type=\"button\" value=\"Name\" onclick=\"psort('name')\"></input>";
header += "<input style=\""+headerStyle+"\" class=\"headerbutton\" type=\"button\" value=\"Difficulty\" onclick=\"psort('difficulty')\"></input>";
header += "<input style=\""+headerStyle+"\" class=\"headerbutton\" type=\"button\" value=\"Rating\" onclick=\"psort('rating')\"></input>";
header += "<input style=\""+headerStyle+"\" class=\"headerbutton\" type=\"button\" value=\"Category\" onclick=\"psort('category')\"></input>";
header += "<input style=\""+headerStyle+"\" class=\"headerbutton\" type=\"button\" value=\"Cells\" onclick=\"psort('cellcount')\"></input>";
header += "<input style=\""+headerStyle+"\" class=\"headerbutton\" type=\"button\" value=\"Lid\" onclick=\"psort('lid')\"></input>";
header += "</div>";
header += "<div id=\"entryTable\" class=\"tableheader\" style=\"width:100%;\"></div>";
table.innerHTML += header;
var etable = document.getElementById("entryTable");
var advsearch = document.getElementById("advsearch");
var headers = document.getElementsByClassName("entry-title");
headers[headers.length-1].style.display = "inline"; //In reality there should only be one element in the array
//Setup posts array and searching arrays
for (var i in posts) {
	var ele = posts[i];
	if (!ele.rating) {
		ele.rating = 1;
	}
	var cstring = ele.cells;
	ele.cells = {};
	var allsplit = cstring.substring(1, cstring.length-1).split("] [");
	for (var j in allsplit) {
		num = allsplit[j].split(" ")[0];
		name = allsplit[j].substring(num.length+1);
		num = parseInt(num);
		ele.cells[name] = num;
		ele.cellcount += num;
	}
}


var textHolderStyle = "width:"+(100/6)+"%;overflow-x:auto;overflow-y:hidden;max-height:inherit;text-align:inherit;background-color:#fff;";
var circleStyle = "float:right;width:1em;height:1em;border-radius:100%;background-color:#aaa;vertical-align:middle;";
var grayStyle = "width:5em;position:relative;z-index:1;max-height:1.2em;overflow:hidden";
var colorStyle = "position:relative;z-index:2;max-height:1.2em;overflow:hidden;margin-top:-1.2em;white-space:nowrap;";
function generateEntry(optionsDict) {
	var id = optionsDict.name.replace(/ /g, "-");
	var html = "<div id=\""+id+"\" class=\"tableentry\" onclick=\"toggleDesc(event, this.id+'Desc', this)\" style=\"display:inline-flex;display:-webkit-inline-box;width:100%;min-height:1.3em;max-height:3.2em;text-align:left;overflow:hidden;padding-bottom:.1em;\">";
	html += "<div class=\"tabletext pname\" style=\""+textHolderStyle+"\"><a href=\""+optionsDict.url+"\">"+optionsDict.name+"</a></div>";
	html += "<div class=\"tabletext pdiff\" style=\""+textHolderStyle+"overflow-x:hidden;\">";
	html += "<div style=\""+grayStyle+"\">"; //Background holder
	for (var i = 1; i <= 5; i++) {
		html += "<img class=\"gray\" src=\""+diffImage+"\" style=\"box-shadow:0 0px;height:1em;width:1em;display:inline-flex;display:-webkit-inline-box;\"></img>";
	}
	html += "</div>";
	html += "<div style=\"width:"+optionsDict.difficulty+"em;"+colorStyle+"\">"; //Forground holder
	for (var i = 1; i <= 5; i++) {
		html += "<img src=\""+diffImage+"\" style=\"box-shadow:0 0px;height:1em;width:1em;position:relative;\"></img>";
	}
	html += "</div>";
	html += "</div>";
	html += "<div class=\"tabletext prate\" style=\""+textHolderStyle+"overflow-x:hidden;\">";
	html += "<div style=\""+grayStyle+"\">"; //Background holder
	for (var i = 1; i <= 5; i++) {
		html += "<img class=\"gray\" src=\""+rateImage+"\" style=\"box-shadow:0 0px;height:1em;width:1em;display:inline-flex;display:-webkit-inline-box;\"></img>";
	}
	html += "</div>";
	html += "<div id=\""+optionsDict.id+"RCover\" style=\"width:"+optionsDict.rating+"em;"+colorStyle+"\">"; //Forground holder
	for (var i = 1; i <= 5; i++) {
		html += "<img src=\""+rateImage+"\" style=\"box-shadow:0 0px;height:1em;width:1em;display:inline-flex;display:-webkit-inline-box;\"></img>";
	}
	html += "</div>";
	html += "</div>";
	html += "<div class=\"tabletext pcategory\" style=\""+textHolderStyle+"\">"+optionsDict.category+"</div>";
	html += "<div class=\"tabletext pcells\" style=\""+textHolderStyle+";\">";
	for (var i in optionsDict.cells) {
		html += "<a href=\""+cellurls[i]+"\" style=\"display:inline\">";
		html += "<img style=\"width:1em;height:1em;\" src=\""+cellimageurls[i]+"\"></img></a>";
	}
	html += "</div>";
	html += "<div class=\"tabletext plid\" style=\""+textHolderStyle+"\">";
	html += "<a href=\""+cellurls[optionsDict.lid]+"\" style=\"display:inline\">";
	html += "<img style=\"width:1em;height:1em;\" src=\""+cellimageurls[optionsDict.lid]+"\"></img></a>";
	html += "<div class=\"tablespinner down\" style=\""+circleStyle+"\"><span style=\";position:relative;top:-45%;\">▲</span></div></div></div>";
	html += "<div id=\""+id+"Desc\" class=\"tabledesc descin\" onclick=\"toggleDesc(this.id)\" style=\"width:100%;overflow:hidden;max-height:100%;min-height:0px\">";
	html += "Licensed as ALv2, Copyright Scott Silver Labs, created by "+optionsDict.author;
	html += "<div>";
	for (var i in optionsDict.cells) {
		html += "<a href=\""+cellurls[i]+"\" style=\"padding-right:1em;\">";
		html += "<img style=\"width:1em;height:1em;\" src=\""+cellimageurls[i]+"\"></img>"+i+"</a>";
	}
	html += "<a href=\""+cellurls[optionsDict.lid]+"\" style=\"float:right;\">";
	html += "<img style=\"width:1em;height:1em;\" src=\""+cellimageurls[optionsDict.lid]+"\"></img>"+optionsDict.lid+"</a>";
	html += "</div>";
	html += "<br/>"+optionsDict.description;
	html += "</div>";
	etable.innerHTML += html;
}

function message(content) {
	var html = "<div class=\"tablenone\" style=\"text-align:center;display:inline-flex;display:-webkit-inline-box;width:100%;min-height:18px;max-height:50px;\">";
	html += "<h4>"+content+"</h4>";
	html += "</div>";
	etable.innerHTML += html;
}

function search(str) {
	entryTable.innerHTML = "";
	var found = 0;
	for (var i in posts) {
		var num = parseInt(str);
		if (posts[i].name.toLowerCase().indexOf(str.toLowerCase()) != -1) {
			found++;
			generateEntry(posts[i]);
		}
	}
	count.innerHTML = "("+found+")";
	if (found === 0) {
		message("No Projects Found");
	}
}

var last;
var lastOrig;
function toggleDesc(event, id, orig) {
	var cur = document.getElementById(id);
	if (cur && !event.target.href) {
		if (last != id) {
			cur.classList.remove("descin");
			cur.classList.add("descout");
			orig.lastChild.lastChild.classList.remove("down");
			orig.lastChild.lastChild.classList.add("up");
		} else { //Ugly, but this fixing a minor toggling issue.
			cur.classList.remove("descout");
			cur.classList.add("descin");
			orig.lastChild.lastChild.classList.remove("up");
			orig.lastChild.lastChild.classList.add("down");
			last = undefined;
			return;
		}
		if (last) {
			var old = document.getElementById(last);
			if (old) {
				old.classList.remove("descout");
				old.classList.add("descin");
				lastOrig.lastChild.lastChild.classList.remove("up");
				lastOrig.lastChild.lastChild.classList.add("down");
			}
		}
		last = id;
		lastOrig = orig;
	}
}

search("");