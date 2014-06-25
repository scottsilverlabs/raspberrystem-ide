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
	Dir.mkdir "./website/images"
	Dir.mkdir "./website/videos"
	Dir.mkdir "./website/pages"
	Dir.mkdir "./website/src"
end
@queue = []
@scanned = {}

def tolocal(url)
	puts url
	name = url[/\/[a-zA-Z\d\-\.]+\/$/]
	if url[/page_id=\d+$/]
		name = url[/\d+$/]
	elsif name == nil
		name = url[/[a-zA-Z\d\-\.]+$/]
	end
	puts name
	path = "pages/"
	if name[/(css|js)/]
		path = "src/"
	elsif name[/(\.jpeg|\.jpg|\.png|\.gif)/]
		path = "images/"
	elsif name[/(\.mp4|\.mjpg|\.mjpeg|\.mpeg|\.avi)/]
		path = "videos/"
	end
	puts path+name
	return path+name
end
def crawl(url)
	@scanned[url] = true
	url = URI.join(@basedomain, url).to_s
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
		puts "Type:" + type.to_s
	end
end
@queue.push baseurl
for i in posts
	@queue.push @basedomain+"wphidden42/?page_id="+i["id"].to_s
end
while @queue.size > 0
	crawl @queue.pop
end