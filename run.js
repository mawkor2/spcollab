var redisInfo = {
  port: "10578",
  host: "67ba1406.dotcloud.com",
  pw: "SWfkK94ltTXsRUcHeByW"
};

var spawn = require('child_process').spawn,
    fs = require('fs'),
    admin_server = spawn('nohup', ['node', './admin_server.js'], {cwd:'/home/ubuntu/spcollab/'}),
    server = spawn('nohup', ['node', './server.js'], {cwd:'/home/ubuntu/spcollab/'}),
    redis = require('redis'),
    redis_cli = redis.createClient(),
    fs = require('fs');
var error_log = fs.createWriteStream('error.log', {'flags': 'a'});
var console_log = fs.createWriteStream('console.log', {'flags': 'a'});

global.storage_key = 'crewlog';


server.on('exit', function (code, signal) {
  
}); 
admin_server.on('exit', function (code, signal) {
  
});

server.stdout.on('data', function (data) {
  process.stdout.write(data);
});

admin_server.stdout.on('data', function (data) {
  try {
    var oData = JSON.parse(data);

    if (oData.revert) {
      server.stdin.write('maintenance');
      revertVersion(oData.revert.version, function(){
        server.kill();
        server = spawn('nohup', ['node', './server.js']);
      });
    }
    else if (oData.set_countdown) {
      server.stdin.write(data);
    }
    else if (oData.set_genre) {
      server.stdin.write(data);
    }
    else if (oData.set_script_length) {
      server.stdin.write(data);
    }
  }
  catch(e) {
    process.stderr.write(data);
  }
});



server.stderr.on('data', function (data) {
  process.stderr.write(data);
});

admin_server.stderr.on('data', function (data) {
  process.stderr.write(data);
});

function revertVersion(version, callback) {
  redis_cli.auth(redisInfo.pw, function() {
    redis_cli.zremrangebyscore(storage_key, '-inf', '+inf');
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
            redis_cli.zadd(storage_key, cur_score, cur_value);
          }
          else {
            cur_value = replies[idx];
          } 
        };
        callback();
      }
    );
  });
};
