var redisInfo = {
  port: "10578",
  host: "67ba1406.dotcloud.com",
  pw: "SWfkK94ltTXsRUcHeByW"
};

console.log('starting server...');

var socketio = require('socket.io'),
  OAuth = require('oauth').OAuth,
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
  dmpmod = require('diff_match_patch'),
  dmp = new dmpmod.diff_match_patch();
  html_file_pad = fs.readFileSync(__dirname + '/views/pad.html.ejs', 'utf8'),
  html_file_layout = fs.readFileSync(__dirname + '/views/layout.ejs', 'utf8'),
  tpl_snapshot = fs.readFileSync(__dirname + '/views/snapshot.html.ejs', 'utf8'),
  tpl_admin = fs.readFileSync(__dirname + '/views/admin.html.ejs', 'utf8'),
  storage_key = 'crewlog',
  local_shadow = {},
  local_shadow_css = {},
  local_shadow_order = [],
  user_count = 0,
  lines_ord = new Array(),
  lines = new Object();
  edits = new Array(),
  changeset = 0,
  chat = new Array(),
  users = new Array(),
  querystring = require('querystring'),
  stdinMsg = '',
  genre = 'Noir Mystery',
  script_length = '100';

var stdin = process.openStdin();

stdin.setEncoding('utf8');

stdin.on('data', function(data) {
  process.stdout.write('stdin received');
  process.stdout.write(data);
  if (data === 'maintenance') {
    io.sockets.emit('maintenance', {});
  }
  else if (data.indexOf('set_countdown') !== -1) {
    var oData = JSON.parse(data);
    var targetDate = new Date(oData.set_countdown.targetDate);
    var currentDate = new Date(oData.set_countdown.currentDate);
    console.log('setting countdown');
    if (countdown) {
      countdown.stop();
    };
    countdown = new Countdown(targetDate, function(){}, function(){}, currentDate);
    countdown.start();
    console.log(countdown.toString());
    io.sockets.emit('set countdown', JSON.stringify({ 
        targetDate: targetDate.toString()
       ,currentDate: currentDate.toString()
      })
    );
  }
  else if (data.indexOf('set_genre') !== -1) {
    var oData = JSON.parse(data);
    genre = oData.set_genre.genre;
    io.sockets.emit('set genre', JSON.stringify({ 
      genre: genre
    }));
  }
  else if (data.indexOf('set_script_length') !== -1) {
    var oData = JSON.parse(data);
    script_length = oData.set_script_length.script_length;
    io.sockets.emit('set script length', JSON.stringify({ 
      script_length: script_length
    }));
  }
});

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

redis_cli.auth(redisInfo.pw, function() {
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
          var redis_obj = parseLineStore(cur_value);
          local_shadow[cur_score] = {
            content: redis_obj.text
           ,cssClass: redis_obj.cssClass
          };;
          local_shadow_order.push(cur_score);
        }
        else {
          cur_value = replies[idx];
        } 
      };
      initServer();
    }
  );
});


// find the start value that score falls between in local_shadow_order
function getShadowIdx(score) {
  score = +score;
  var cur_val;
  for (var i=0;i<local_shadow_order.length;i++) {
    cur_val = local_shadow_order[i];
    if (score < cur_val) {
      if (i === 0) {
        return 0;
      }
      return i;
    }
  }
  return local_shadow_order.length; 
};

function initServer() {
  app = http.createServer(function(req, res) {
    var headers = [['Content-Type', 'text/html']];
    var cookies = {};
    req.headers.cookie && req.headers.cookie.split(';').forEach(function( cookie ) {
      var parts = cookie.split('=');
      cookies[ parts[ 0 ].trim() ] = ( parts[ 1 ] || '' ).trim();
    });

    var uri = url.parse(req.url).pathname;
    var oQuery = querystring.parse(url.parse(req.url).query);
    
    if (uri === '/') {

      var snapshot_html = [], cur_value, cur_score, countdownData = '';
      _lock = true;
      for (var idx=0; idx<local_shadow_order.length; idx++) {
        cur_score = local_shadow_order[idx];
        if (!local_shadow[cur_score]) {
          console.log('could not find score at ' + cur_score);
          continue;
        }
        cur_value = local_shadow[cur_score].content;
        cur_css_class = local_shadow[cur_score].cssClass;
        snapshot_html.push(
          '<p data-uuid="'
         +cur_score
         + '" class="' 
         +cur_css_class 
         + '">' 
         +cur_value
         +'</p>'
        );
      };
      var online_users = '';
      for (var userIdx in users) {
        var _user = users[userIdx];
        if (_user.online) {
          online_users += ['<li id="'
            ,_user.id
            ,'"><img class="chat_pic" src="'
            ,_user.profile_pic.url
            ,'"><span class="user_name">'
            ,_user.name
            ,'</span></li>']
          .join('');
        }
      };
      snapshot_html = snapshot_html.join('');
      var pad_layout = ejs.render(html_file_pad, {
        encoding: 'utf8',
        locals: {
          snapshot: snapshot_html
         ,onlineUsers: online_users
        }
      });
      var user_html = '';
      var countdown_html = ['<div id="countdown">','0:0:0:0','</div>'];
      var user_data = 'var socialScreenplayUser = null;';
      var userInfo = null;
      var twitterUrl = '""';
      if (cookies['user_info']) {
        userInfo = JSON.parse(decodeURIComponent(cookies['user_info']));
      }
      if (userInfo && users[userInfo.id]) {
        var current_user = users[userInfo.id];
        user_html = [
          '<span class="welcome">Welcome ' + current_user.name + '!</span>'
         ,'<img class="status_pic" src="' + current_user.profile_pic.url + '">'
        ].join('');
        user_data = 'var socialScreenplayUser = ' + JSON.stringify(current_user);
      }
      else {
        twitterConsumer().getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){
          if (error) {
            console.log(error);
            res.writeHead(500, headers);
            res.end('oauth problem');
          } else {  
            headers.push(['Set-Cookie','oauthRequestToken=' + oauthToken]);
            headers.push(['Set-Cookie','oauthRequestTokenSecret=' + oauthTokenSecret]);
            twitterUrl = '\'https://twitter.com/oauth/authorize?oauth_token=' + oauthToken + '\'';
            if (countdown) {
              countdown_html[1] = countdown.toString();
              countdownData = 'var countdownData = ' + JSON.stringify({
                targetDate: (new Date(countdown.targetDate.getTime() + countdown.currentDate.getTime())).toString()
               ,currentDate: countdown.currentDate.toString()
              });
            }
            var html_layout = ejs.render(html_file_layout, {
              encoding: 'utf8',
              locals: {
                content: pad_layout
               ,userHtml: user_html
               ,userData: user_data
               ,countdown: countdown_html.join('')
               ,countdownData: countdownData
               ,twitterUrl: twitterUrl
               ,genre: genre
               ,script_length: script_length
              }
            });
            _lock = false;      
            res.writeHead(200, headers);
            res.end(html_layout);
          }
        });
        user_html = '';
        return;
      }
      if (countdown) {
        countdown_html[1] = countdown.toString();
        countdownData = 'var countdownData = ' + JSON.stringify({
          targetDate: (new Date(countdown.targetDate.getTime() + countdown.currentDate.getTime())).toString()
         ,currentDate: countdown.currentDate.toString()
        });
      }
      var html_layout = ejs.render(html_file_layout, {
        encoding: 'utf8',
        locals: {
          content: pad_layout
         ,userHtml: user_html
         ,userData: user_data
         ,countdown: countdown_html.join('')
         ,countdownData: countdownData
         ,twitterUrl: twitterUrl
        }
      });
      _lock = false;      
      res.writeHead(200, headers);
      res.end(html_layout);

    } else if (uri === '/admin/') {
      var snapshot_links = [];
      redis_cli.keys('', function(err, replies) {
        for (var i=0;i<replies.length;i++) {
          var key = replies[i];
          snapshot_links.push(
            '<li><a href="javascript:loadSnapshot(\''
           +replies.split['_'][1]
           +'\')">snapshot '
           +replies.split['_'][1]
           +'</a></li>'
          );
        }
        var html_layout = ejs.render(tpl_admin, {
          encoding: 'utf8',
          locals: {
            snapshot_links: snapshot_links.join('')
          }
        });
        res.writeHead(200, headers);
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
            var redis_obj = parseLineStore(cur_value);
            cur_value = redis_obj.content;
            cur_css_class = redis_obj.cssClass;
            snapshot_html.push(
              '<p data-uuid="'
              +cur_score
              + '" class="' 
              +cur_css_class 
              + '">' 
              +cur_value
              +'</p>'
            );
          };
          var page_html = ejs.render(tpl_snapshot, {
            encoding: 'utf8',
            locals: {
              snapshot: snapshot_html
            }
          });
          res.writeHead(200, headers);
          res.end(page_html);
        }
      );

    } else if (uri === '/oAuth/') {
      var consumer = twitterConsumer();
      consumer.getOAuthAccessToken(cookies.oauthRequestToken, cookies.oauthRequestTokenSecret, oQuery.oauth_verifier, function(error, oauthAccessToken, oauthAccessTokenSecret, results) {
        if (error) {
          res.writeHead(500, {});
          res.end("Error getting OAuth access token : " + sys.inspect(error) + "["+oauthAccessToken+"]"+ "["+oauthAccessTokenSecret+"]"+ "["+sys.inspect(results)+"]");
        } else {
          headers.push(['Set-Cookie','oauthAccessToken=' + oauthAccessToken + '; path=/']);
          headers.push(['Set-Cookie', 'oauthAccessTokenSecret=' + oauthAccessTokenSecret + '; path=/']);
          consumer.get("http://twitter.com/account/verify_credentials.json", oauthAccessToken, oauthAccessTokenSecret, function (error, data, response) {
            if (error) {
              res.send("Error getting twitter screen name : " + sys.inspect(error), 500);
            } else {
              var current_user = {};
              current_user.using_twitter = true;
              current_user.tw_data = JSON.parse(data);
              User.initialize(current_user);
              var user_cookie = JSON.stringify({
                using_twitter: true
               ,id: current_user.id
              });
              headers.push(['Set-Cookie','user_info=' + encodeURIComponent(user_cookie) + '; path=/']);
              users[current_user.id] = current_user;
              users[current_user.id].online = true;
              headers.push(['Location','/']);
              res.writeHead(302, headers);
              res.end();
            }  
          });  
        }
      });
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
      userSockets[current_user.id] = socket;
      if (!(users[current_user.id]) || !(users[current_user.id].online)) {
        userArray[userArray.length] = current_user.id;
        var sUser = JSON.stringify(current_user);
        if (!current_user.is_credential) {
          users[current_user.id] = JSON.parse(sUser); // TODO: better way of deep clone
        }
        io.sockets.emit('user join', JSON.stringify(users[current_user.id]));
        socket.emit('confirm login', JSON.stringify(current_user));
      }
      users[current_user.id].online = true;
    });
      
    socket.on('set countdown', function(data) {
      var time_message = JSON.parse(data);
      var time_to_end = new Date((new Date()).getTime() + time_message.time);
      if (countdown) {
        countdown.stop();
      };
      countdown = new Countdown(time_to_end, function(newTime){}, function(){ io.sockets.broadcast('countdown end'); }, new Date());      
    });
    socket.on('snapshot', function(data) {
      // TODO: snapshot
      main_store.set('pad-snapshot', serialized_message, function(){});
    });
    socket.on('playback', function() {
      for(var edit_id in edits) {
        socket.emit('playback', edits[edit_id]);
      }
      socket.emit('playback_done', '{"payload": ""}');
    });
    socket.on('chat', function(data) {
      var chat_message = JSON.parse(data);      
      socket.broadcast.emit('chat', JSON.stringify(chat_message));
    });
    socket.on('add line', function(data) {
      var oData = JSON.parse(data);
      var timestamp = new Date().getTime();
      change = ++changeset;
      oData = {
        'action' : 'add_line',
        'payload': {
          'user': socket.user_id,
          'message': oData.data,
          'timestamp': timestamp,
          'changeset': change
        }
      };
      var msg = oData.payload.message;
      var prev_uuid = +msg['previous_uuid'];
      sys.puts(msg['cssClass']);
      var next_uuid = msg['next_uuid'] ? +msg['next_uuid'] : +msg['previous_uuid'] + 100;
      if (prev_uuid === next_uuid) {
        console.log('Start and end scores are equal. Cannot add the line, or the line is already there');
        _lock = false;
        return;
      }
      redisAddLine(prev_uuid, next_uuid, msg['content'], msg['uuid']
        ,msg['cssClass'], function(clientUUID, newUUID) {
        
        socket.emit('set uuid', JSON.stringify({
          clientUUID : clientUUID
         ,newUUID : newUUID
         ,cssClass : oData.payload.message.cssClass
        }));
        oData.payload.message.uuid = newUUID;
        local_shadow[newUUID] = {
          content: oData.payload.message.content
         ,cssClass: oData.payload.message.cssClass
        };
        console.log(local_shadow);
        console.log(oData.payload.message.cssClass);
        if (local_shadow_order.indexOf(newUUID) === -1) {
          local_shadow_order.splice(getShadowIdx(newUUID), 0, newUUID);
        }
        socket.broadcast.emit('add line', JSON.stringify(oData));
        edits.push(oData);
        _lock = false;
      });
    });
    socket.on('modify_line', function(data) {
      var message_obj = JSON.parse(data);
      var msg = message_obj['message'];
      modifyLine(msg, socket);
    });
    socket.on('remove_line', function(data) {
      console.log('Remove line');
      var message_obj = JSON.parse(data);
      var msg = message_obj['message'];
      var timestamp = new Date().getTime();
      change = ++changeset;   
      var serialized_message = JSON.stringify({
       'payload': {
          'user': socket.user_id
         ,'message': msg
         ,'timestamp': timestamp
         ,'changeset': change
        }
      });
      serialized_message.action = 'remove_line';
      socket.broadcast.emit('remove line', serialized_message);
      msg.action = 'remove_line';
      edits.push(serialized_message);
      removeLine(msg);
    });
    socket.on('disconnect', function() {
      var arrId = userArray.indexOf(current_user.id);
      if (arrId !== -1 && userSockets[current_user.id] && users[current_user.id]) {
        userArray.splice(arrId, 1);
        delete userSockets[current_user.id];
        users[current_user.id].online = false;
        socket.broadcast.emit('user leave', JSON.stringify({
          using_facebook: true
         ,id : current_user.id
        }));
      };
    });

    socket.on('revert', function(data) {
      var oData = JSON.parse(data);
      var version = +oData.version;
      revertVersion(version, function() {
        console.log('Revert complete!');
      });      
    });
  });
  app.listen(8080);
};

function log(data){
  console.log("\033[0;32m"+data+"\033[0m");
}

// TODO: pretty up nasty beast code that follows
var redisAddLine = function(
  start_score
 ,end_score
 ,content
 ,clientUUID
 ,cssClass
 ,callback 
 ) {
  if (_lock) {
    setTimeout(
      function(){ redisAddLine(start_score, end_score, content, clientUUID, cssClass, callback); }
    , 1);
    return;
  };
  redis_cli.zrangebyscore(
    storage_key
   ,start_score
   ,end_score
   ,'WITHSCORES'
   ,function(err, replies) {
      console.log('ok');
      console.log(JSON.stringify(replies));
      if (!replies || replies.length === 0) {
        var score = getMidScore(start_score, end_score);
        redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
          function() { 
            callback(clientUUID, score);  
          }
        );   
      }
      else if (replies.length >= 2) {
        console.log(start_score === +(replies[1]));
        console.log(typeof start_score);
        if (start_score < +(replies[1])) { 
          var score = getMidScore(start_score, +(replies[1]));
          redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
            function() { 
              callback(clientUUID, score);
            }
          );        
        }
        else if (start_score === +(replies[1])) {
          if (replies.length > 2) {
            var score = getMidScore(start_score, +(replies[3]));
            redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
              function() { 
                callback(clientUUID, score);
              }
            );   
          }
          else {
            var score = getMidScore(start_score, end_score);
            console.log('adding...');
            redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
              function() {
                console.log('calling callback'); 
                callback(clientUUID, score);
              }
            );   
          }
        }
        else  {   
          // do nothing
        }
      }
  });
};

var getMidScore = function(start_score, end_score) {
  console.log('getting mid score between ' + start_score + ':' + end_score);
  if (start_score === end_score) {
    throw new Error('Cannot call getMidScore if the start_score and end_score are equal');
  }
  if (start_score > end_score) {
    var tmp = start_score;
    start_score = end_score;
    end_score = tmp;
  };
  var toFixedVal = 0;
  var trueMid = (end_score - start_score)/2 + start_score;
  while (!(start_score < trueMid.toFixed(toFixedVal) && trueMid.toFixed(toFixedVal) < end_score)) {
    toFixedVal += 1;
  };
  console.log('mid is ' + trueMid.toFixed(toFixedVal));
  return +(trueMid.toFixed(toFixedVal));
};

var modifyLine = function(msg, socket){
  var uuid = msg["uuid"];
  if (_lock) {
    setTimeout(
      function(){ modifyLine(msg, socket); }
    , 1);
    return;
  };  
  _lock = true;
  redis_cli.zrangebyscore(
    storage_key
   ,uuid
   ,uuid
   ,function(err, replies) {
      if (!replies || !local_shadow[uuid]) {
        // the line was removed
        _lock = false;
        return;
      }
      if (replies.length > 0) {
        var patch = msg['content'];
        var cssClass = msg['cssClass'];
        var local_shadow_text = local_shadow[uuid].content || '';
        var timestamp = new Date().getTime();
        var change = ++changeset;
        var oMessage = {
          'payload': {
            'user': socket.user_id,
            'message': msg,
            'timestamp': timestamp,
            'changeset': change
          }
        };   
        var serialized_message = JSON.stringify(oMessage);
        serialized_message.action = 'modify_line';
        edits.push(serialized_message);
        var redis_obj = parseLineStore(replies[0]);
        var new_local_shadow = (dmp.patch_apply(patch, local_shadow_text))[0];
        var new_local_text = (dmp.patch_apply(patch, redis_obj.text))[0];
        redis_cli.zrem(
          storage_key
         ,replies[0]
        );
        redis_cli.zadd(
          storage_key
         ,uuid
         ,cssClass + '-' + redis_obj.key + ':' + new_local_text
        );
        delete serialized_message.action;
        var diff = dmp.diff_main(new_local_shadow, new_local_text);
        if (diff.length > 2) {
          dmp.diff_cleanupSemantic(diff);
        }
        var patch_list = dmp.patch_make(new_local_shadow, new_local_text, diff);
        local_shadow[uuid].content = new_local_text;
        local_shadow[uuid].cssClass = cssClass;
        socket.broadcast.emit('modify line', JSON.stringify(oMessage));
        _lock = false;
      }
    }
  );
};

var removeLine = function(msg){
  if (_lock) {
    setTimeout(
      function(){ removeLine(msg); }
    , 1);
    return;
  };
  var uuid = +msg["uuid"];
  if (local_shadow_order.indexOf(uuid) >= 0) {
    var indexToRemove = local_shadow_order.indexOf(uuid);
    local_shadow_order.splice(indexToRemove, 1);
  };
  delete local_shadow[uuid];
  var score_index = +uuid;
  redis_cli.zrangebyscore(
    storage_key
   ,score_index
   ,score_index
   ,'WITHSCORES'
   ,function(err, replies) {
      if (replies && replies.length > 0) {
        if (+(replies[1]) === score_index) {
          redis_cli.zrem(storage_key, replies[0], function() {
            _lock = false;  
          });
        };
      };
    }
  );
};

var _lock = false;

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

var _twitterConsumerKey = 'wfgUY9uJyKknKAw24I79g';
var _twitterConsumerSecret = 'GckRfNEj7V2vMTY4lO3ybFKRzpQIBPSJ2S2aOYXTE';
// oauth twitter
function twitterConsumer() {
  return new OAuth(
    "https://twitter.com/oauth/request_token", "https://twitter.com/oauth/access_token", 
    _twitterConsumerKey, _twitterConsumerSecret, "1.0A", "http://ec2-204-236-154-241.us-west-1.compute.amazonaws.com:8080/oAuth/", "HMAC-SHA1");   
};

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
        url: current_user.tw_data.profile_image_url
       ,dimensions: {
          width: '50'
         ,height: '50'
        }
      };
      console.log(JSON.stringify(current_user.tw_data));
      current_user.id = 'tw-' + current_user.tw_data.id;
      var aName = current_user.tw_data.name.split(' ');
      current_user.name = aName[0] + ' ' + aName[1].substr(0, 1);
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
      current_user.id = 'em-' + current_user.em_data.email;
      current_user.name = current_user.em_data.email;
    }
  };
  return this;
}();


