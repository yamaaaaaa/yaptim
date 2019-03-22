const { app,ipcMain,BrowserWindow } = require("electron");
const fs = require('fs');
const exec = require('child_process').exec;
var eventObj;
var baseDir;
let win;

app.on('ready',()=>{
	win = new BrowserWindow({width: 400,height: 400});
	win.loadURL('file://'+__dirname+'/index.html');
	win.on("closed",() => {win = null; });
});

app.on('window-all-closed',()=>{
	if(process.platform !== 'darwin'){
		app.quit();
	}
});

app.on('activate',()=>{
	if(win===null){
		createWindow();
	}
});

var cnt = 0;
var cntTotal = 0;
var optimImages = [];
var isEnd = false;

var addCount = function(){
	cnt++;
	sendCountMessage();
};
var decCount = function(){
	cnt--;
	sendCountMessage();
	if(cnt==0 && !isEnd){
		isEnd = true;
		var command = ['~/.nodebrew/current/bin/imageOptim',optimImages.join(' ')].join(' ');
		console.log(command);
		exec(command, (error, stdout, stderr) => {
			eventObj.sender.send('end-convert','end');
		});
		eventObj.sender.send('count','now optimizing..');
	}
};

var sendCountMessage = function(){
	eventObj.sender.send('count',cnt+'/'+cntTotal);
};

var checkHasAlpha =function(stdout){
	var lines = stdout.split('\n');
	lines.shift();
	var line;
	for(let i = 0; i < lines.length; i++){
		if(lines[i].length==0){
			continue;
		}
		line = lines[i].split('#')[1];
		try{
			var alpha = line.substr(6,2);	
			console.log('alpha:'+alpha);		
			if(alpha!='FF' && alpha!='  ') {
				return 'png';
			}
		}catch(e){
			console.log('lines:'+lines);
			console.log('lines.length:'+lines.length);
			console.log('lines[i]:'+(typeof lines[i]));
			console.log('lines[i].length:'+lines[i].length);
			console.log(e);
		}
	}
	return 'jpg';
};

var triming = function(convert_cmd,filepath){
	optimImages.push(filepath);
	//一旦トリミングのためにボーダーつける。
	var command = [convert_cmd,filepath,'-bordercolor','transparent','-border','10',filepath].join(' ');
	exec(command, (error, stdout, stderr) => {
		//トリミング実行
		command = [convert_cmd,filepath,'-fuzz','1%','-trim',filepath].join(' ');
		exec(command, (error, stdout, stderr) => {
			//再度JPGにできないかのチェック
			command = [convert_cmd,filepath,'txt:',' | grep -v "FF  " | grep -E -v "#......  "'].join(' ');
			exec(command, (error, stdout, stderr) => {
				var type = checkHasAlpha(stdout);
				console.log('2nd check:'+type);
				if(type=='jpg'){
		        	toJpeg(convert_cmd,filepath);
				}else{
					decCount();
				}				
			});
		});
	});
};

var toJpeg = function(convert_cmd,filepath){
	optimImages.push(filepath);
	var command = [convert_cmd,filepath,'-quality','95',filepath.replace('png','jpg')].join(' ');
	exec(command, (error, stdout, stderr) => {
		decCount();
		try {
			fs.unlinkSync(filepath);
		} catch (error) {
			throw error;
		}
	});
};

ipcMain.on('select', function( event, directory ){
	eventObj = event;
	directory+="/";
	baseDir = directory;
	var im = require('imagemagick');
	var convert_cmd = '/usr/local/bin/convert';
	fs.readdir(directory, function(err, files){
	    if (err) throw err;
	    optimImages = [];
	    isEnd = false;
	    cntTotal = 0;
	    files.filter(function(file){
	    	return /.*\.png$/.test(file);
	    }).forEach(function (file) {	
	        let filepath = directory+file;
	        //FF  はベタなので除外
			//#......  は6桁=ベタなので除外
	        var command = [convert_cmd,filepath,'txt:',' | grep -v "FF  " | grep -E -v "#......  "'].join(' ');
	        addCount();
	        cntTotal++;
			exec(command, (error, stdout, stderr) => {
				var type = checkHasAlpha(stdout);
				console.log('1st check:'+type);
				if(type=='png'){
					triming(convert_cmd,filepath);
		        }else if(type=='jpg'){
		        	toJpeg(convert_cmd,filepath);
				}
			});
	    });
	});
});


ipcMain.on('stop', function( event , arg){
	app.quit();
});

