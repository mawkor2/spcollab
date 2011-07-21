var redisInfo = {
  port: "10578",
  host: "67ba1406.dotcloud.com",
  pw: "SWfkK94ltTXsRUcHeByW"
};

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
  dmpmod = require('diff_match_patch'),
  dmp = new dmpmod.diff_match_patch();
  html_file_pad = fs.readFileSync(__dirname + '/views/pad.html.ejs', 'utf8'),
  html_file_layout = fs.readFileSync(__dirname + '/views/layout.ejs', 'utf8'),
  storage_key = 'crewlog',
  local_shadow = {},
  local_shadow_css = {},
  local_shadow_order = [],
  user_count = 0;
  lines_ord = new Array(),
  lines = new Object();
  edits = new Array(),
  changeset = 0,
  chat = new Array(),
  users = new Array();

var _lock = false;
global.app = null;
global.io = null;
  

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
          cur_score = replies[idx];
          var redis_obj = parseLineStore(cur_value);
          local_shadow[cur_score] = {
            content: redis_obj.text
           ,cssClass: redis_obj.cssClass
          };;
          local_shadow_order.push(cur_score.toString());
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
  score = score - 0;
  var cur_val;
  for (var i=0;i<local_shadow_order.length;i++) {
    cur_val = local_shadow_order[i] - 0;
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
    var uri = url.parse(req.url).pathname;
    
    if (uri === '/' || uri === '/pad') {
    
      var snapshot_html = [], cur_value, cur_score;
      for (var idx=0; idx<local_shadow_order.length; idx++) {
        cur_score = local_shadow_order[idx] - 0;
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
      snapshot_html = snapshot_html.join('');
      var pad_layout = ejs.render(html_file_pad, {
        encoding: 'utf8',
        locals: {
          snapshot: snapshot_html
        }
      });     
      var html_layout = ejs.render(html_file_layout, {
        encoding: 'utf8',
        locals: {
          content: pad_layout
        }
      });      
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end(html_layout);

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
    var self = socket;
    current_user_id = socket.user_id = ++user_count;  
    users.push(socket.user_id);
    
    io.sockets.emit('init', '{"channel": "initial", "id":' 
      + current_user_id + ', "users":' + JSON.stringify(users) 
      + '}');
    log("gesendet: "+'{"channel": "initial", "id":' 
      + current_user_id + ', "users":[' + JSON.stringify(users) + ']}');
    socket.broadcast.emit('join',
      '{"channel": "join", "payload": {"user": '+socket.user_id+'}}');
    log("gesendet: "+'{"channel": "join", "payload": {"user": ' + socket.user_id    
      + '}}');

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
      var message_obj = JSON.parse(data);
      var msg = message_obj['message'];
      var timestamp = new Date().getTime();
      var serialized_message = JSON.stringify({
        'channel': 'chat',
        'payload': {
          'user': socket.user_id,
          'message': msg,
          'timestamp': timestamp
        }
      });
      log('gesendet: ' + serialized_message);
      
      socket.broadcast.emit('chat', serialized_message);
      chat.push(serialized_message);
    });
    socket.on('add line', function(data) {
      var oData = JSON.parse(data);
      var timestamp = new Date().getTime();
      change = ++changeset;
      oData = {
        'data': {
          'user': socket.user_id,
          'message': oData.data,
          'timestamp': timestamp,
          'changeset': change
        }
      };
      var sData = JSON.stringify(oData);
      oData.action = 'add_line';
      edits.push(data);
      var msg = oData.data.message;
      var prev_uuid = msg["previous_uuid"];
      sys.puts(msg['cssClass']);
      var next_uuid = msg["next_uuid"] ? msg["next_uuid"] : (msg["previous_uuid"] - 0) + 1;
      redisAddLine(prev_uuid, next_uuid, msg["content"], msg['uuid']
        ,msg['cssClass'], function(clientUUID, newUUID) {
        _lock = false;
        socket.emit('set uuid', JSON.stringify({
          clientUUID : clientUUID
         ,newUUID : newUUID
         ,cssClass : oData.data.message.cssClass
        }));
        oData.data.message.uuid = newUUID;
        var data = JSON.stringify({
          'data': {
            'user': oData.data.user_id,
            'message': oData.data,
            'timestamp': oData.data.timestamp,
            'changeset': oData.data.changeset
          }
        });
        local_shadow[newUUID] = {
          content: oData.data.message.content
         ,cssClass: oData.data.message.cssClass
        };
        console.log(oData.data.message.cssClass);
        local_shadow_order.splice(getShadowIdx(newUUID), 0, newUUID.toString());
        socket.broadcast.emit('add line', data);
      });
    });
    socket.on('modify_line', function(data) {
      var message_obj = JSON.parse(data);
      var msg = message_obj['message'];
      modifyLine(msg, socket);
    });
    socket.on('remove_line', function(data) {
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
      socket.broadcast.emit('remove line', serialized_message);
      serialized_message.action = 'remove_line';
      edits.push(serialized_message);
      removeLine(msg);
    });
    socket.on('disconnect', function() {
      socket.broadcast.emit('leave', '{"channel": "leave", "user": ' 
        + socket.user_id + '}');
      var pos = users.indexOf(socket.user_id);
      if (pos >= 0) {
        users.splice(pos, 1);
      }
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
      function(){ arguments.callee.apply(arguments); }
    , 1);
    return;
  };
  _lock = true;
  start_score = start_score - 0;
  end_score = end_score - 0;
  redis_cli.zrangebyscore(
    storage_key
   ,start_score
   ,end_score
   ,'WITHSCORES'
   ,function(err, replies) {
      if (!replies || replies.length === 0) {
        var score = (start_score + end_score)/2;
        redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
          function() { 
            callback(clientUUID, score);  
          }
        );   
      }
      else if (replies.length >= 2) {
        if (start_score < (replies[1] - 0)) { 
          var score = (start_score + (replies[1] - 0))/2;
          redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
            function() { 
              callback(clientUUID, score);
            }
          );        
        }
        else if (start_score === (replies[1] - 0)) {
          if (replies.length > 2) {
            var score = (start_score + (replies[3] - 0))/2;
            redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
              function() { 
                callback(clientUUID, score);
              }
            );   
          }
          else {
console.log(cssClass + '-' + generateUUID() + ':' + content);
            var score = (start_score + end_score)/2;
            redis_cli.zadd(storage_key, score, cssClass + '-' + generateUUID() + ':' + content, 
              function() { 
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
      if (replies.length > 0) {
        var patch = msg["content"];
        var cssClass = msg["cssClass"];
        var local_shadow_text = local_shadow[uuid].content || "";
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
        oMessage.payload.changeset = patch_list;
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
  var uuid = msg["uuid"];
  if (local_shadow_order.indexOf(uuid.toString()) >= 0) {
    var indexToRemove = local_shadow_order.indexOf(uuid.toString());
    local_shadow_order.splice(indexToRemove, 1);
  };
  delete local_shadow[uuid];
  var score_index = (uuid - 0);
  redis_cli.zrangebyscore(
    storage_key
   ,score_index
   ,score_index
   ,'WITHSCORES'
   ,function(err, replies) {
      if (replies.length > 0) {
        if ((replies[1] - 0) === score_index) {
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

