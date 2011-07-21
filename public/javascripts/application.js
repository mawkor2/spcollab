if(!Object.create){
  Object.create = function(o){
    function C(){};
    C.prototype = o;
    return new C();
  };
};
var diff_worker = new Worker('/javascripts/diff_worker.js')  // outbound
   ,sync_worker = new Worker('/javascripts/patch_worker.js') // inbound
   ,user_id
   ,predefined_colors = 
   [ '#FFCFEA'
    ,'#E8FF9C'
    ,'#FFCC91'
    ,'#42C0FF'
    ,'#A7FF9E'
    ,'#7DEFFF'
    ,'#BABDFF'
    ,'#FFD4EB'
    ,'#AAFF75'
    ,'#FF9EAB'
    ,'#DCFF91'
    ,'#8088FF'
   ]
   ,assigned_colors = {}
   ,update_queue  = []
   ,updating_process_running = false
   ,playback_mode = false
   ,take_diffs = true
   ,socket = io.connect()
   ,local_shadow = {}
   ,local_shadow_order = []
   ,play_chat_sound = true;

// Worker callbacks
diff_worker.onmessage = function(ev) {
  var uuid = ev.data.id;
  var content = ev.data.changes;
  var cssClass = ev.data.cssClass;
  var line_msg = {'uuid': uuid, 'content': content, 'cssClass': cssClass};
  socket.emit('modify_line', JSON.stringify({'message': line_msg}));
};

sync_worker.onmessage = function(ev) {
  var patching_uuid = ev.data[0];
  var patch_user_id = ev.data[1];
  var local_text_change = ev.data[2];
  var local_shadow_change = ev.data[3];
  var local_shadow_css_change = ev.data[4];
  var modifying_line = jQuery('[data-uuid="' + patching_uuid + '"]');
  if (local_text_change !== '' || local_shadow_css_change !== jQuery(modifying_line).className) {
    local_shadow[patching_uuid] = { 'content' : local_shadow_change
    ,'cssClass': local_shadow_css_change };
    jQuery(modifying_line).html(local_text_change);
    jQuery(modifying_line).get(0).className = local_shadow_css_change;
    highlightUserEdit(modifying_line, patch_user_id);
  };
};

// Socket methods
socket.on('connect', function() {
  //console.log('user connected');    
});

socket.on('init', function(data) {
  var oData = JSON.parse(data)
     ,existingLines = jQuery('#editable_content').
      children('div').children('p');
  // global. TODO: namespace
  user_id = oData['id'];
  for (var idx in oData['users']) {
    addUser(oData['users'][idx]);
  }
  window.setInterval(checkForUpdates, 100);
});

socket.on('join', function(data) {
  var oData = JSON.parse(data);  
  addUser(oData["payload"]["user"]);
});

socket.on('leave', function(data) {
  var oData = JSON.parse(data);  
  removeUser(oData["user"]);
});

socket.on('chat', function(data) {
  var oData = JSON.parse(data);
  oData.action = 'chat';  
  update_queue.push(oData);
});

socket.on('add line', function(data) {
  var oData = JSON.parse(data);
  oData.action = 'add_line';
  var payload = {
    action: 'add_line',
    payload: oData.data.message.message
  };
  update_queue.push(payload);
});

socket.on('modify line', function(data) {
  var oData = JSON.parse(data);
  oData.action = 'modify_line';
  update_queue.push(oData);
});

socket.on('remove line', function(data) {
  var oData = JSON.parse(data);
  oData.action = 'remove_line';
  update_queue.push(oData);
});

socket.on('playback done', function(data) {
  var oData = JSON.parse(data);  
  oData.action = 'playback_done';
  update_queue.push(oData);
});

socket.on('set uuid', function(data) {
  console.log('set uuid');
  var oData = JSON.parse(data);
  var elem = jQuery('[data-uuid="' + oData.clientUUID + '"]');
  elem.attr('data-uuid', oData.newUUID);
  elem.get(0).className = oData.cssClass;
  local_shadow[oData.newUUID] = local_shadow[oData.clientUUID];
  local_shadow_order[local_shadow_order.indexOf(oData.clientUUID)] = 
    oData.newUUID;
  delete local_shadow[oData.clientUUID];
  updating_process_running = false;
});

var checkForUpdates = function(){
  if (update_queue.length > 0 && updating_process_running === false) {
    var current_update = update_queue.shift();
    updating_process_running = true;
    console.log('Update:' +  current_update['action']);
    applyUpdate(current_update['action'], current_update['payload']);
  };
};

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

var applyUpdate = function(action, update) {
  switch (action) {
    case 'add_line':
      addLine(update);
      break;
    case 'modify_line':
      modifyLine(update);
      break;
    case 'remove_line':
      removeLine(update);
      break;
    case 'playback_done':
      playback_mode = false;
      break;
    case 'chat':
      newChatMessage(update['user'], update['message']);
      break;
    default:
      //console.log('invalid update');
  };
};

var addLine = function(payload){
  var content = payload['content'];
  var cssClass = payload['cssClass']
  var new_line = jQuery(
   [ '<p data-uuid="'
    ,payload['uuid']
    ,'" class="'
    ,cssClass
    ,'">'
    ,content
    ,'</p>'
   ].join(''));
  var next_line = jQuery(
   [ '[data-uuid="'
    ,payload['next_uuid']
    ,'"]'
   ].join(''));
  var previous_line = jQuery(
   [ '[data-uuid="'
    ,payload['previous_uuid']
    ,'"]'
   ].join(''));
  if (next_line.length > 0){
    next_line.before(new_line);
  }
  else if (previous_line.length > 0){
    previous_line.after(new_line);
  }
  else {
    jQuery('div#editable_content div').append(new_line);
  }
  assigned_colors[payload['user']] = predefined_colors.pop();
  highlightUserEdit(new_line, payload['user']);
  local_shadow_order.splice(getShadowIdx(payload['uuid']), 0, payload['uuid']);    
  local_shadow[payload['uuid']] = { 
      'content': content
     ,'cssClass': cssClass
    };
  console.log(local_shadow[payload['uuid']]);
  updating_process_running = false;
};

var modifyLine = function(payload){
  var uuid = payload['message']['uuid'];
  var cssClass = payload['message']['cssClass'];
  var user_id = payload['user'];
  var patch = payload['message']['content'];
  var local_text = jQuery('[data-uuid="' + uuid + '"]').text(); 
  var _local_shadow = local_shadow[uuid].content; 
  sync_worker.postMessage({
    'uuid': uuid
   ,'patch': patch
   ,'local_text': local_text
   ,'local_shadow': _local_shadow
   ,'user_id': user_id
   ,'cssClass': cssClass
  });
  updating_process_running = false;
};

var removeLine = function(payload){
  var uuid = payload['message']['uuid'];
  var user_id = payload['user'];
  var line = jQuery('[data-uuid="' + uuid + '"]');
  highlightUserEdit(line, payload['user'], function(){
    line.remove();
    delete local_shadow[uuid];
    // TODO: this leaves sparse array, and undefined @ index, fix!
  });
  updating_process_running = false;
};

var highlightUserEdit = function(line, user, callback){
  /*
  line.animate({ backgroundColor: assigned_colors[user] }, 'fast')
      .animate({ backgroundColor: "#FFFFFF" }, 'slow');
  if(callback) {
    callback.call();
  };
  */
};

jQuery("#editable_content").keydown(function(ev) {
  //don't delete the beyond p
  if(ev.keyCode === 8 || ev.keyCode === 46){
    var editing_lines = jQuery('#editable_content').children('div').children('p');
    if(editing_lines.length === 1 && jQuery(editing_lines[0]).html() === ''){
      jQuery(editing_lines[0]).html('&nbsp;'); 
      return false;
    }
  }
});

var generateUUID = function(){
  var padid = "1";
  var userid = user_id;
  var d = new Date();
  var timestamp = jQuery.map(
    [ d.getUTCFullYear()
     ,d.getUTCMonth()
     ,d.getUTCDate()
     ,d.getUTCHours()
     ,d.getUTCMinutes()
     ,d.getUTCSeconds()
     ,d.getUTCMilliseconds()
    ],
    function(n, i) {
      return (n < 10) ? '0' + n : n; 
    }
  ).join("");
  return padid + "_" + userid + "_" + timestamp;
};

var inspectLineChanges = function(i) {
  if (updating_process_running) {
    return;
  }
  var editable_lines = jQuery('#editable_content').children('p');
  var removed_lines_uuids = [];
  for (var line_uuid in local_shadow) {
    removed_lines_uuids.push(line_uuid); 
  };
  editable_lines.each(function(i) {
    var uuid = jQuery(this).attr('data-uuid');
    var prev_uuid = jQuery(this).prev('p').attr('data-uuid') || '';
    var next_uuid = jQuery(this).next('p').attr('data-uuid') || '';
    var cssClass = this.className;
    var content = jQuery(this).text();
    if(uuid === undefined || uuid === prev_uuid) {
      var new_uuid =  generateUUID();
      jQuery(this).attr('data-uuid', new_uuid);
      local_shadow[new_uuid] = {
        'content': content,
        'cssClass': cssClass
      };
      var insertIdx = local_shadow_order.indexOf(prev_uuid) + 1;
      local_shadow_order.splice(insertIdx, 0, new_uuid);
      socket.emit('add line', JSON.stringify(
        { 'data': {
          'uuid': new_uuid
         ,'previous_uuid': prev_uuid
         ,'next_uuid': next_uuid
         ,'content': content
         ,'cssClass': cssClass
         }
        }
      ));
    }
    else {
      if (local_shadow[uuid].content.length != jQuery(this).text().length ||
        local_shadow[uuid].content != jQuery(this).text()
        || local_shadow[uuid].cssClass !== cssClass) {
        diff_worker.postMessage(
          [ uuid
           ,local_shadow[uuid].content
           ,jQuery(this).text()
           ,cssClass
           ,local_shadow[uuid].cssClass
          ]
        );
        local_shadow[uuid] = {'content': jQuery(this).text(), 'cssClass': cssClass};
      };
      removed_lines_uuids.splice(removed_lines_uuids.indexOf(uuid), 1);
    };
  });
  if (removed_lines_uuids.length > 0){
    for (var i=0;i<removed_lines_uuids.length;i++) {
      var removedUUID = removed_lines_uuids[i];
      delete local_shadow[removedUUID];
      local_shadow_order.splice(local_shadow_order.indexOf(removedUUID), 1);
      socket.emit('remove_line', JSON.stringify(  
        { 'message': { 'uuid': removedUUID } }
      ));
    };
  }
}

var addUser = function(id){
  var new_user_li = jQuery('<li id="user-' + id + '"></li>');
  assigned_colors[id] = predefined_colors.pop();
  new_user_li.append(
    [ '<span class="user_color" style="background-color:' 
     ,assigned_colors[id] 
     ,'; color: '
     ,assigned_colors[id]
     ,'">.</span>'
    ].join(''));
  new_user_li.append(
    [ '<span class="user_name">User-'
     ,id
     ,'</span>'
    ].join(''));
  jQuery("#users_list").append(new_user_li); 
};

var removeUser = function(id){
  jQuery('li#user-' + id).remove();
};


var newChatMessage = function(uid, msg){
  chat_user = jQuery('<span class="user" style="color:' + assigned_colors[uid] + '">User-' + uid + '</span>')
  chat_message = jQuery('<span class="message">' + msg + '</span>');
  chat_timestamp = jQuery('<span class="timestamp">6.53am</span>');

  chat_line = jQuery('<li class="chat_message unread"></li>');
  chat_line.append(chat_user);
  chat_line.append(chat_message);
  chat_line.append(chat_timestamp);

  jQuery('ul#chat_messages').append(chat_line)  
  //TODO: set focus on last line added
  jQuery(chat_line).scroll();

  //TODO: sound doesn't play in chrome
  if (play_chat_sound)
    jQuery('#chat_alert_sound')[0].play();
}

var doPlayback = function(){
  socket.emit('playback', '{"type": "playback", "message":""}');
  playback_mode = true;
  jQuery('#editable_content div').html('');
  local_shadow = {};
  jQuery('ul#chat_messages').html('');
}

jQuery(document).ready(function(){
  jQuery('#chat_sound_control').toggle(function(){
      jQuery(this).children('img').attr('src','/images/chat_mute_icon.png'); 
      play_chat_sound = false;
    }, function(){
      jQuery(this).children('img').attr('src', '/images/chat_sound_icon.png'); 
      play_chat_sound = true;
    }
  );
  jQuery('#input_chat_message').keypress(function(ev) {
    if((ev.keyCode || ev.which) == 13){
      ev.preventDefault();
      socket.emit('chat', JSON.stringify({
        'type': 'chat'
       ,'message': jQuery(this).val()
      }));
      jQuery(this).val('');
    }
  });
  jQuery('#pad_playback').click(function(){
    doPlayback();
    return false;     
  });
  var editing_lines = jQuery('#editable_content').children('p');
  for (var i=0;i<editing_lines.length;i++) {
    var uuid = jQuery(editing_lines[i]).attr('data-uuid');
    var local_text_value = jQuery(editing_lines[i]).html();
    var cssClass = jQuery(editing_lines[i]).get(0).className;
    local_shadow_order.push(uuid);
    local_shadow[uuid] = { 'content': local_text_value, 'cssClass': cssClass };
  };
  window.setInterval(inspectLineChanges, 99);
});
