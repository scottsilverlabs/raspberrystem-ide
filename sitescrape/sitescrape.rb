#!/usr/bin/env ruby
require "open-uri"
require "json"
cwd = File.dirname __FILE__
@repscript = open("#{cwd}/projectspage.js").read
@baseurl = "http://dev.raspberrystem.com/wphidden42/?page_id=5"
@localbase = cwd+"/website/"
@basedomain = @baseurl[/http:\/\/.+\.com\//]
con = open(@baseurl)
html = con.read
json = html[/posts = \[.+\]/][8..-1]
@posts = JSON.parse json
if !Dir.exists? "./website"
	Dir.mkdir "./website"
end
@queue = []
@scanned = {}
@urlhashes = {}

def formatUrl(url)
	if url[0, 2] == "//"
		url = "http:"+url
	end
	url = URI.join(@basedomain, URI.unescape(url.gsub("&#038;", ""))).to_s.gsub("www.", "")
	return url
end

def tolocal(url)
	url = formatUrl(url)
	return @urlhashes[url] if @urlhashes[url]
	@urlhashes[url] = url.hash.to_s(16).gsub("-", "0")
	return @urlhashes[url] #.to_s(16) to convert to hex
end

def crawl(url)
	@scanned[url] = true
	url = formatUrl(url)
	puts url+" -> "+tolocal(url)
	page = nil
	begin
		page = open url
	rescue
		puts "404 "+url
		return
	end
	type = page.content_type
	body = page.read
	if type == "text/html"
		return if !url.include? @basedomain
		jqs = body.scan /<script[^>]+jquery[^>]+><\/script>/
		for i in jqs
			body = body.gsub i, ""
		end
		if url == formatUrl(@baseurl)
			script = body[/var diffImage.+psort\("name"\);/m]
			diff = formatUrl(@repscript[/var diffImage.*/][17..-3])
			rate = formatUrl(@repscript[/var rateImage.*/][17..-3])
			cellurls = JSON.parse body[/cellurls = \{[^\}]+\}/][11..-1]
			for i, v in cellurls
				cellurls[i] = formatUrl(tolocal(@basedomain+"wphidden42/"+v))
				@queue.push formatUrl(tolocal(@basedomain+"wphidden42/"+v))
			end
			@repscript = @repscript.gsub "cellurls = {}", "cellurls = " + JSON.generate(cellurls)
			@queue.push diff, rate
			@repscript = @repscript.gsub diff, tolocal(diff)
			@repscript = @repscript.gsub rate, tolocal(rate)
			localposts = []
			for i in @posts
				local = tolocal(formatUrl(@basedomain+"wphidden42/?page_id="+i["id"].to_s))
				localposts.push(i.clone()).last["url"] = local
			end
			for i in localposts
				i["cells"] = i["cells"].gsub("\r", "").strip
				i["lid"] = i["lid"].gsub("\r", "").strip
				i["category"] = i["category"].gsub("\r", "").strip
				if i["description"]
					i["description"] = i["description"].gsub("\r", "").strip
				end
			end
			cellimageurls = {}
			for i in localposts
				s = i["cells"].scan /\[[^\]]+\]/
				for v in s
					v = v[v.split(" ")[0].length+1..-2]
					if not cellimageurls[v]
						cellimageurls[v] = tolocal(formatUrl(@basedomain+"wphidden42/cellicons/"+v.downcase().gsub(" ", "-")))
						@queue.push formatUrl(@basedomain+"wphidden42/cellicons/"+v.downcase().gsub(" ", "-"))
					end
				end
				puts s.to_s
			end
			@repscript = @repscript.gsub "cellimageurls = {}", "cellimageurls = "+JSON.generate(cellimageurls)
			@repscript = @repscript.gsub "posts = []", "posts = "+JSON.generate(localposts)
			body = body.gsub script, @repscript
		end
		youtubes = body.scan /<iframe [^>]+src=\"http:\/\/www.youtube\S+\"[^<]+<\/iframe>/
		for i in youtubes
			width = i[/width=\"[0-9]+\"/]
			height = i[/height=\"[0-9]+\"/]
			id = i[/src=\"http:\/\/www.youtube\S+\"/][34..-1].split("?")[0]
			body = body.gsub i, "<img #{width} #{height} src=\"http://img.youtube.com/vi/#{id}/0.jpg\"></img>"
		end
		links = body.scan /href="[^ #]+"/
		links.concat body.scan /href='\S+'/ #\S because the open sans URL has # in it
		links.concat body.scan /src="[^ #]+"/
		links.concat body.scan /src='[^ #]+'/
		for i in links
			trimmed = i[/\".+\"/] || i[/\'.+\'/]
			if !@scanned[i]
				@queue.push trimmed[1..-2]
				@scanned[i] = true
			end
			body = body.gsub trimmed, "\""+tolocal(trimmed[1..-2])+"\""
		end
		f = nil
		f = File.open "./website/"+tolocal(url), "w"
		f.write body
	else
		f = File.open "./website/"+tolocal(url), "w"
		f.write body
	end
end
#crawl @baseurl
@queue.push @baseurl
for i in @posts
	@queue.push @basedomain+"wphidden42/?page_id="+i["id"].to_s
end

threads = []
for i in 1..8
	threads.push(Thread.new {
		while @queue.size > 0
			crawl @queue.pop
		end
	}).last.run
	sleep(0.1)
end

alive = true
while alive
	for i in threads
		alive = alive && i.alive?
	end
	sleep 1
end
