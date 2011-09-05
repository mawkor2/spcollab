var redisInfo = {
  port: "10578",
  host: "67ba1406.dotcloud.com",
  pw: "SWfkK94ltTXsRUcHeByW"
};

var redis = require('redis'),
    redis_cli = redis.createClient();

global.storage_key = 'crewlog'

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
        callback(key);
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
}



snapshot(function(key) {
  console.log(key);
});
