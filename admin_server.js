var redisInfo = {
  port: "10578",
  host: "67ba1406.dotcloud.com",
  pw: "SWfkK94ltTXsRUcHeByW"
};

console.log('starting admin server...');

var socketio = require('socket.io'),
  http = require('http'),
  sys = require('sys'),
  redis = require('redis'),
  //redis_cli = redis.createClient(redisInfo.port, redisInfo.host),
  redis_cli = redis.createClient(),
  fs = require('fs'),
  ejs = require('ejs'),
  url = require('url'),
  path = require('path'),
  util = require('util'),
  tpl_admin = fs.readFileSync(__dirname + '/views/admin.html.ejs', 'utf8'),
  tpl_maintenance = fs.readFileSync(__dirname + '/views/maintenance.html.ejs', 'utf8'),
  tpl_snapshot = fs.readFileSync(__dirname + '/views/snapshot.html.ejs', 'utf8'),
  storage_key = 'crewlog',
  querystring = require('querystring');

var _lock = false;
global.app = null;
global.io = null;
global.users = {}; // to randomize user selection
global.userArray = [];
global.userSockets = {};
global.countdown = null;  

function findType(uri) {
  if (!uri) { return undefined };
  switch ((uri.match(/\.\w+$/gi))[0]) {
    case '.js':
      return 'text/javascript';
    case '.html': 
      return 'text/html';
    case '.css': 
      return 'text/css';
    case  '.manifest':
      return 'text/cache-manifest';
    case '.ico': 
      return 'image/x-icon';
    case '.jpeg': 
      return 'image/jpeg';
    case '.jpg': 
      return 'image/jpg';
    case '.png': 
      return 'image/png';
    case '.gif': 
      return 'image/gif';
    case '.svg': 
      return 'image/svg+xml';
    default:
      return undefined;   
  }
}

function sendError(code, response) {
  response.writeHead(code);
  response.end();
  return;
};

function parseLineStore(line) {
  // css values for customization will go here
  var aLineStore = line.split(':');
  var lineValue = (aLineStore.length > 1) ? 
    (aLineStore.slice(1)).join(':') : '';
  var lineKey = aLineStore[0];
  var lineKeyId = lineKey.split('-')[1]
  var cssClass = lineKey.split('-')[0];
  var retVal = {
    key: lineKeyId
   ,text: lineValue
   ,cssClass: cssClass
  };
  return retVal;
};



function initServer() {
  setInterval(snapshot, 1000 * 60 * 60); // snapshot every 60 min
  app = http.createServer(function(req, res) {
    
    var cookies = {};
    req.headers.cookie && req.headers.cookie.split(';').forEach(function( cookie ) {
      var parts = cookie.split('=');
      cookies[ parts[ 0 ].trim() ] = ( parts[ 1 ] || '' ).trim();
    });

    var uri = url.parse(req.url).pathname;
    var oQuery = querystring.parse(url.parse(req.url).query);
    var countdownData = '';
    
    if (uri === '/admin/') {
      var user_html = '';
      var countdown_html = ['<div id="countdown">','0:0:0:0','</div>'];
      var user_data = 'var socialScreenplayUser = null;';
      var userInfo = null;
      if (cookies['user_info']) {
        userInfo = JSON.parse(decodeURIComponent(cookies['user_info']));
      }
      if (userInfo) {
        var userInfo = JSON.parse(decodeURIComponent(cookies['user_info']));
        if (users[userInfo.id]) {
          var current_user = users[userInfo.id];
          user_html = [
            '<span class="welcome">Welcome ' + current_user.name + '!</span>'
           ,'<img class="status_pic" src="' + current_user.profile_pic.url + '">'
          ].join('');
          user_data = 'var socialScreenplayUser = ' + JSON.stringify(current_user);
        };  
      }
      else {
        user_html = '';
      }
      if (countdown) {
        countdown_html[1] = countdown.toString();
        countdownData = 'var countdownData = ' + JSON.stringify({
          targetDate: (new Date(countdown.targetDate.getTime() + countdown.currentDate.getTime())).toString()
         ,currentDate: countdown.currentDate.toString()
        });
      }
      var snapshot_links = [];
      redis_cli.keys(storage_key + '_*', function(err, replies) {
        replies.sort(function(a, b){
          return (+a.split('_')[1] - +b.split('_')[1]);
        });
        for (var i=0;i<replies.length;i++) {
          var key = replies[i];
          snapshot_links.push(
            '<li><a href="javascript:loadSnapshot(\''
           +key.split('_')[1]
           +'\')">snapshot '
           +key.split('_')[1]
           +'</a></li>'
          );
        }
        var html_layout = ejs.render(tpl_admin, {
          encoding: 'utf8',
          locals: {
            snapshot_links: snapshot_links.join('')
           ,userHtml: user_html
           ,userData: user_data
           ,countdown: countdown_html.join('')
           ,countdownData: countdownData
          }
        });
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(html_layout);
      });
    } else if (uri === '/snapshot/') {
      var storage_key_full = storage_key;
      if (oQuery.version) {
        storage_key_full = storage_key + '_' + oQuery.version
      }
      redis_cli.zrange(
        storage_key_full
       ,'0'
       ,'-1'
       ,function(err, replies) {
          var snapshot_html = [], cur_value;
          for (var idx=0; idx<replies.length; idx++) {
            var redis_obj = parseLineStore(replies[idx]);
            cur_value = redis_obj.text;
            cur_css_class = redis_obj.cssClass;
            snapshot_html.push(
              '<p class="' 
              +cur_css_class 
              + '">' 
              +cur_value
              +'</p>'
            );
          };
          var page_html = ejs.render(tpl_snapshot, {
            encoding: 'utf8',
            locals: {
              snapshot: snapshot_html.join('')
            }
          });
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.end(page_html);
        }
      );

    } else if (uri === '/maintenance/') {
      var page_html = ejs.render(tpl_maintenance, {
        encoding: 'utf8',
        locals: { 
                 
        }
      });
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(page_html);
    } else {
    
      var _file = path.join(process.cwd(), 'public', uri);
      
      path.exists(_file, function(exists) {
        if (!exists) {
          sendError(404, res);
        } else {
          fs.stat(_file, function(err, stat) {
            //var file = __dirname + uri,
            var file = _file,
              type = findType(uri),
              size = stat.size;
            if (!type) {
              sendError(500, res);
            }
            log('GET ' + file);
            res.writeHead(200, {'Content-Type':type, 'Content-Length':size});
            var rs = fs.createReadStream(file);
            util.pump(rs, res, function(err) {
              if (err) {
                console.log("ReadStream, WriteStream error for util.pump");
                res.end();
              }
            });
          });
        }
      });
    }
  });
  io = socketio.listen(app);
  io.set('log level', 0);
  io.sockets.on('connection', function(socket) {
    var current_user = {};

    socket.on('login', function(data) {
      current_user = JSON.parse(data);
      socket.emit('confirm login', JSON.stringify(current_user));
    });

    socket.on('snapshot', function(data) {
      snapshot();
    });
    
    var User = function() {
      this.initialize = function(current_user){
        if (current_user.using_facebook) {
          var fb_id = current_user.fb_data.id;
          current_user.profile_pic = {
            url: 'http://graph.facebook.com/' + fb_id + '/picture?type=small'
           ,dimensions: {
              width: '50'
             ,height: '50'
            }
          };
          current_user.id = 'fb-' + current_user.fb_data.id;
          current_user.name = current_user.fb_data.first_name + ' ' + current_user.fb_data.last_name.substr(0,1);
        }
        else if (current_user.using_twitter) {
          // TODO: add twitter profile pic and id
          current_user.profile_pic = {
            url: 'http://graph.facebook.com/100002477830761/picture?type=small'
           ,dimensions: {
              width: '50'
             ,height: '50'
            }
          };
          current_user.id = 'tw-' + generateUUID();
          current_user.name = 'twitter user'
        }
        else if (current_user.using_email) {
          // TODO: add email profile pic and id
          current_user.profile_pic = {
            url: 'http://graph.facebook.com/100002477830761/picture?type=small'
           ,dimensions: {
              width: '50'
             ,height: '50'
            }
          };
          current_user.id = 'em-' + generateUUID();
          current_user.name = current_user.email;
        }
      };
      return this;
    }();
      
    socket.on('set countdown', function(data) {
      var time_message = JSON.parse(data);
      var targetDate = (new Date()).addDays(time_message.days);
      var currentDate = new Date();
      if (countdown) {
        countdown.stop();
      };
      countdown = new Countdown(targetDate, function(newTime){
        
      }, function(){ io.sockets.broadcast('countdown end'); }, currentDate);
      process.stdout.write(JSON.stringify(
        {'set_countdown': {
          'targetDate': targetDate.toString()
         ,'currentDate': currentDate.toString()
          }
        }
      )); 
    });

    socket.on('revert', function(data) {
      process.stdout.write(data);
    });

    socket.on('set countdown', function(data) {
      var oData = JSON.parse(data);
      var days = +oData.days;
    });

    socket.on('set genre', function(data) {
      var oData = JSON.parse(data);
      var genre = oData.genre;
      process.stdout.write(JSON.stringify({'set_genre':{'genre':genre}}));
    });

    socket.on('set script length', function(data) {
      var oData = JSON.parse(data);
      var script_length = oData.script_length;
      process.stdout.write(JSON.stringify({'set_script_length':{'script_length':script_length}}));
    });

  });
  app.listen(18080);
};

function log(data){
  console.log("\033[0;32m"+data+"\033[0m");
}

var generateUUID = function(){
  var d = new Date();
  var timestamp = [
    d.getUTCFullYear()
   ,d.getUTCMonth()
   ,d.getUTCDate()
   ,d.getUTCHours()
   ,d.getUTCMinutes()
   ,d.getUTCSeconds()
   ,d.getUTCMilliseconds()
  ];
  for (var i=0;i<timestamp.length; i++) {
    timestamp[i] = (timestamp[i] < 10) ? '0' + timestamp[i] : timestamp[i];
  };
  timestamp.push(Math.floor(Math.random()*1001));
  return timestamp.join('');
};

Date.prototype.addDays = function(days) {
  this.setTime(this.getTime() + (1000 * 60 * 60 * 24 * days));
  return this;
};
Date.prototype.addHours = function(hours) {
  this.setTime(this.getTime() + (1000 * 60 * 60 * hours));
  return this;
};
Date.prototype.addMinutes = function(minutes) {
  this.setTime(this.getTime() + (1000 * 60 * minutes));
  return this;
};
Date.prototype.addSeconds = function(seconds) {
  this.setTime(this.getTime() + (1000 * seconds));
  return this;
};
Date.prototype.getDays = function() {
  return Math.floor(this.getTime() / (1000 * 60 * 60 * 24));
};
Date.prototype.getHours = function() {
  return Math.floor(this.getTime() / (1000 * 60 * 60));
};
Date.prototype.getMinutes = function() {
  return Math.floor(this.getTime() / (1000 * 60));
};
Date.prototype.getSeconds = function() {
  return Math.floor(this.getTime() / (1000));
};
Date.prototype.getShortDateAndTime = function() {
  return this.getShortDate() + " " + this.getTimeString();
};
Date.prototype.getShortDate = function() {
  return this.getMonth() + "/" +  this.getDate() + "/" +  this.getFullYear();
};
Date.prototype.getTimeString = function() {
  // returns a string of the format %h:%m(AM|PM)
  var hours = this.getHours();
  var hourString;
  var minutesString = (this.getMinutes() == 0) ? "00" : this.getMinutes(); 
  if (hours > 12) {
    hourString = hours - 12 + ":" + minutesString + 'PM';
  }
  else {
    hourString = hours + ":" + minutesString  + 'AM';
  }
  return hourString;
};
Date.prototype.fromNow = function() {
  // returns the difference of the date and the current date added to Jan 1, 
  // 1970
  var now = new Date();
  var difference = this.getTime() - now.getTime();
  return new Date(difference);
};

var Countdown = function(targetDate, cbTick, cbEnd, currentDate) {
  if (currentDate) {
    this.currentDate = new Date(currentDate);
  }
  else {
    this.currentDate = new Date();
  }
  this.targetDate = new Date(targetDate.getTime() - currentDate.getTime());
  this.cbEnd = cbEnd;
  this.cbTick = cbTick
  this.start();
  return this;
};

Countdown.prototype.getDays = function() {
  return this.targetDate.getDays();
};
Countdown.prototype.getHours = function() {
  return this.targetDate.getHours() - (this.targetDate.getDays() * 24);
};
Countdown.prototype.getMinutes = function() {
  return this.targetDate.getMinutes() - (this.targetDate.getHours() * 60);
};
Countdown.prototype.getSeconds = function() {
  return this.targetDate.getSeconds() - (this.targetDate.getMinutes() * 60);
};

Countdown.prototype.tickSecond = function() {
  this.targetDate.addSeconds(-1);
  this.cbTick(this.targetDate);
  if (this.targetDate.getSeconds() <= 0) {
    this.stop();
    this.cbEnd();
  };
};

Countdown.prototype.toString = function() {
  var sCd = '';
  sCd += this.getDays() + ':';
  sCd += this.getHours() + ':';
  sCd += this.getMinutes() + ':';
  sCd += this.getSeconds();
  return sCd;
};

Countdown.prototype.start = function() {
  this.intervalId = setInterval(curry(this.tickSecond, this), 1000);
};

Countdown.prototype.stop = function() {
  clearInterval(this.intervalId);
};

function curry(fn, scope) {
  var args = [];
  for (var i=2, len = arguments.length; i < len; ++i) {
    args.push(arguments[i]);
  };
  return function() {
	  fn.apply(scope, args);
  };
};

function revertVersion(version, callback) {
  redis_cli.auth(redisInfo.pw, function() {
    redis_cli.zremrangebyscore('crewlog', '-inf', '+inf');
    redis_cli.zrange(
      storage_key + '_' + version
     ,'0'
     ,'-1'
     ,'WITHSCORES'
     ,function(err, replies) {
        var snapshot_html = [], cur_value, cur_score;
        for (var idx=0; idx<replies.length; idx++) {
          if (idx %2 !== 0) {
            cur_score = +replies[idx];
            redis_cli.zadd('crewlog', cur_score, cur_value);
          }
          else {
            cur_value = replies[idx];
          } 
        };
        if (callback) {
          callback();
        }
      }
    );
  });
};

function snapshot(callback) {
  redis_cli.keys('crewlog_*', function(err, replies){
    console.log(replies);
    var key = getNextKey(replies);
    redis_cli.zrange(
      storage_key
     ,'0'
     ,'-1'
     ,'WITHSCORES'
     ,function(err, replies) {
        var snapshot_html = [], cur_value, cur_score;
        for (var idx=0; idx<replies.length; idx++) {
          if (idx %2 !== 0) {
            cur_score = +replies[idx];
            redis_cli.zadd(storage_key + '_' + key, cur_score, cur_value);
          }
          else {
            cur_value = replies[idx];
          } 
        };
        if (callback) {
          callback(key);
        };
      }
    );
  });
};

function getNextKey(replies) {
  var key = 0;
  if (replies) {
    for (var i=0;i<replies.length;i++) {
      var replyIdx = +replies[i].split('_')[1];
      if (replyIdx > key) {
        key = replyIdx;
      }
    }
  }
  return key + 1;
};

initServer();

