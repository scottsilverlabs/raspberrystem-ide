#!/usr/bin/env ruby
require "open-uri"
#require "URI"
require "json"
baseurl = "http://dev.raspberrystem.com/wphidden42/?page_id=5"
@localbase = "/root/Desktop/website/"
@basedomain = baseurl[/http:\/\/.+\.com\//]
con = open(baseurl)
html = con.read
json = html[/posts = \[.+\]/][8..-1]
posts = JSON.parse json
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
	if url["googleapis"]
		puts url
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
	puts "#{url} -> "+tolocal url
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
		youtubes = body.scan /<iframe [^>]+src=\"http:\/\/www.youtube\S+\"[^<]+<\/iframe>/
		for i in youtubes
			puts i
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
			body = body.gsub trimmed, "\""+@localbase+tolocal(trimmed[1..-2])+"\""
		end
		f = nil
		f = File.open "./website/"+tolocal(url), "w"
		f.write body
	elsif type[/image/]
		puts "Image " + url
		f = File.open "./website/"+tolocal(url), "w"
		f.write body
	elsif type == "application/javascript"
		f = File.open "./website/"+tolocal(url), "w"
		f.write body
	elsif type == "text/css"
		f = File.open "./website/"+tolocal(url), "w"
		f.write body
	else
		puts "Unsupported type:" + type.to_s
	end
end
@queue.push baseurl
for i in posts
	@queue.push @basedomain+"wphidden42/?page_id="+i["id"].to_s
end
while @queue.size > 0
	crawl @queue.pop
end
