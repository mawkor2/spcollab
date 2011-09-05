var redisInfo = {
  port: "10578",
  host: "67ba1406.dotcloud.com",
  pw: "SWfkK94ltTXsRUcHeByW"
};

var redis = require('redis'),
    redis_cli = redis.createClient();

global.storage_key = 'crewlog'

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
        callback();
      }
    );
  });
};

function revertComplete() {
  console.log('Revert complete!');
};

revertVersion(1, revertComplete);
