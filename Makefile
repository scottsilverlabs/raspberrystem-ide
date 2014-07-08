PI=pi@raspberrypi

.PHONV: all clean install pi-install deb

clean:
	rm server
	rm payload.tar.gz

install:
	go build ./server.go
	cp ./server /usr/bin/ideserver
	- mkdir /etc/ide
	- cp -R sitescrape/website /etc/ide
	cp -R assets /etc/ide/
	cp *.html /etc/ide/
	cp settings.conf /etc/ide/

pi-install:
	GOARCH=arm GOARM=5 go build ./server.go
	tar -czf payload.tar.gz ./server ./assets ./ide.html ./api.html ./settings.conf ./sitescrape/website
	ssh $(PI) "mkdir /etc/ide/; cd /etc/ide; tar -xzf -; mv ./server /usr/bin/ideserver" < ./payload.tar.gz

deb:
