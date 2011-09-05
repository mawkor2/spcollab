if(!Object.create){
  Object.create = function(o){
    function C(){};
    C.prototype = o;
    return new C();
  };
};
if(navigator.appName === 'Microsoft Internet Explorer'){
  Array.prototype.indexOf = function(obj){
    for(var i=0; i<this.length; i++){
      if(this[i]==obj){
        return i;
      }
    }
    return -1;
  }
  if (+navigator.appVersion.split('.')[0] < 8) {
    alert('Functionality is limited in Internet Explorer 7 and under, consider upgrading your browser.');
  }
}

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
   ,current_user = {}
   ,update_queue  = []
   ,updating_process_running = false
   ,playback_mode = false
   ,take_diffs = true
   ,socket = io.connect()
   ,local_shadow = {}
   ,local_shadow_order = []
   ,play_chat_sound = true
   ,countdown = null;

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
  updating_process_running = false;
};

// Socket methods
socket.on('connect', function() {
  //console.log('user connected');    
});

socket.on('set countdown', function(data) {
  jQuery(document.getElementById('editable_content')).attr('contenteditable', 'true');
  document.getElementById('key').style.display = 'none';
  var oData = JSON.parse(data);
  var targetDate = new Date(oData.targetDate);
  var currentDate = new Date(oData.currentDate);
  if (countdown) {
    countdown.stop();
  };
  countdown = new Countdown(
    targetDate 
   ,function() {
      jQuery(document.getElementById('countdown')).text(countdown.toString())
    }
   ,function() {
      jQuery(document.getElementById('editable_content')).attr('contenteditable', 'false');
      document.getElementById('key').style.display = 'block';
      alert('The countdown has ended! Editing is disabled until the next round.');
    }
   ,currentDate);
});

socket.on('maintenance', function() {
  alert('The system is undergoing maintenance');
  document.location.href = document.location.origin.replace(/:[^:]*$/, ':18080') + '/maintenance/';
});

socket.on('user join', function(data) {
  var oData = JSON.parse(data);  
  addUser(oData);
});

socket.on('user leave', function(data) {
  var oUser = JSON.parse(data);
  removeUser(oUser.id);
});

socket.on('chat', function(data) {
  var oData = JSON.parse(data);
  oData.action = 'chat';  
  update_queue.push(oData);
});

socket.on('confirm login', function(data){
  if (!socialScreenplayUser) {
    socialScreenplayUser =  JSON.parse(data); 
  }
});

socket.on('add line', function(data) {
  var oData = JSON.parse(data);
  update_queue.push(oData);
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

socket.on('set genre', function(data) {
  var oData = JSON.parse(data);  
  jQuery(document.getElementById('genre')).text(oData.genre);
});

socket.on('set script length', function(data) {
  var oData = JSON.parse(data);  
  jQuery(document.getElementById('script_length')).text(oData.script_length);
});

socket.on('set uuid', function(data) {
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
      PageHandlerModule.createPages();
      break;
    case 'modify_line':
      modifyLine(update);
      PageHandlerModule.createPages();
      break;
    case 'remove_line':
      removeLine(update);
      PageHandlerModule.createPages();
      break;
    case 'playback_done':
      playback_mode = false;
      break;
    case 'chat':
      newChatMessage(update);
      break;
    default:
      //console.log('invalid update');
  };
};

var addLine = function(payload){
  var content = payload['message']['content'];
  var cssClass = payload['message']['cssClass']
  var new_line = jQuery(
   [ '<p data-uuid="'
    ,payload['message']['uuid']
    ,'" class="'
    ,cssClass
    ,'">'
    ,content
    ,'</p>'
   ].join(''));
  var next_line = jQuery(
   [ '[data-uuid="'
    ,payload['message']['next_uuid']
    ,'"]'
   ].join(''));
  var previous_line = jQuery(
   [ '[data-uuid="'
    ,payload['message']['previous_uuid']
    ,'"]'
   ].join(''));
  if (next_line.length > 0){
    next_line.before(new_line);
  }
  else if (previous_line.length > 0){
    previous_line.after(new_line);
  }
  else {
    jQuery('div#editable_content').append(new_line);
  }
  //assigned_colors[payload['user']] = predefined_colors.pop();
  highlightUserEdit(new_line, payload['user']);
  local_shadow_order.splice(getShadowIdx(payload['message']['uuid']), 0, payload['message']['uuid']);    
  local_shadow[payload['message']['uuid']] = { 
      'content': content
     ,'cssClass': cssClass
    };
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
};

var removeLine = function(payload){
  var uuid = payload['message']['uuid'];
  var user_id = payload['user'];
  var line = jQuery('[data-uuid="' + uuid + '"]');
  line.remove();
  if (local_shadow_order.indexOf(uuid) >= 0) {
    var indexToRemove = local_shadow_order.indexOf(uuid);
    local_shadow_order.splice(indexToRemove, 1);
  };
  delete local_shadow[uuid];
  updating_process_running = false;
};

var user_edit_animating = false;

var highlightUserEdit = function(line, user, callback){
  if (!user_edit_animating) {
    user_edit_animating = true;
    var loop = jQuery.runloop();
    var current_bg_color = "#ffffff";
    if (line.hasClass('sceneHeading')) {
      current_bg_color = 'silver';
    }
    loop.addKey('25%', function(){ line.animate({
      backgroundColor: '#72EDED',
    }) });
    loop.addKey('50%', function(){ line.animate({
      backgroundColor: current_bg_color,
    }) });
    loop.addKey('75%', function(){ line.animate({
      backgroundColor: '#72EDED',
    }) });
    loop.addKey('100%', function(){ line.animate({
      backgroundColor: current_bg_color,
    }) });

    loop.play(1000, function(){ user_edit_animating = false; line.css('backgroundColor',current_bg_color);});
  }
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
    if (prev_uuid.indexOf('-') !== -1 || next_uuid.indexOf('-') !== -1) {
      jQuery(this).remove();
      return;
    }
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
      PageHandlerModule.createPages();
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
        PageHandlerModule.createPages();
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
    PageHandlerModule.createPages();
  }
}

var addUser = function(user){
  if (!jQuery('li#' + user.id).length) {
    var new_user_li = jQuery('<li id="' + user.id + '"></li>');
    //assigned_colors[id] = predefined_colors.pop();
    new_user_li.append(
      [ '<img class="chat_pic" src="' 
       ,user.profile_pic.url
       ,'">'
      ].join(''));
    new_user_li.append(
      [ '<span class="user_name">'
       ,user.name
       ,'</span>'
      ].join(''));
    jQuery("#users_list").append(new_user_li);
  } 
};

var removeUser = function(id){
  jQuery('li#' + id).remove();
};


var newChatMessage = function(chat_message){
  var chat_message_html = [ '<li id="'
   ,chat_message.id
   ,'"><img class="chat_pic" src="'
   ,chat_message.profile_pic_url
   ,'"><span class="chat_name">'
   ,chat_message.name + ': '
   ,'<span class="message">'
   ,chat_message.message
   ,'</span></li>']
  .join('');
  jQuery('ul#chat_messages').append(chat_message_html);  
  //TODO: set focus on last line added
  var scrollElem = jQuery('#chat_messages li:last');
  var container = jQuery('#chat_messages');
  container.scrollTo(scrollElem);
  //TODO: sound doesn't play in chrome
  if (play_chat_sound) {
    jQuery('#chat_alert_sound')[0].play();
  }
  updating_process_running = false;
}

var doPlayback = function(){
  socket.emit('playback', '{"type": "playback", "message":""}');
  playback_mode = true;
  jQuery('#editable_content div').html('');
  local_shadow = {};
  jQuery('ul#chat_messages').html('');
}

jQuery(document).ready(function(){
  if (jQuery(document.getElementById('countdown')).text() === '0:0:0:0') {
    jQuery(document.getElementById('editable_content')).attr('contenteditable', 'false');
  }
  else {
    var targetDate = new Date(countdownData.targetDate);
    var currentDate = new Date(countdownData.currentDate);
    if (countdown) {
      countdown.stop();
    };
    countdown = new Countdown(
      targetDate 
     ,function() {
        jQuery(document.getElementById('countdown')).text(countdown.toString())
      }
     ,function() {
        jQuery(document.getElementById('editable_content')).attr('contenteditable', 'false');
        alert('The countdown has ended! Editing is disabled until the next round.');
      }
     ,currentDate);
  }
  PageHandlerModule.createPages();
  jQuery('#chat_sound_control').toggle(function(){
      jQuery(this).children('img').attr('src','/images/chat_mute_icon.png'); 
      play_chat_sound = false;
    }, function(){
      jQuery(this).children('img').attr('src', '/images/chat_sound_icon.png'); 
      play_chat_sound = true;
    }
  );
  jQuery(function($){	
    $('.drag').drag(function( ev, dd ){		
      $( this ).css({			
        top: dd.offsetY,			
        left: dd.offsetX		
      });	
    },{relative:true});
  });
  jQuery('#input_chat_message').keypress(function(ev) {
    if((ev.keyCode || ev.which) == 13){
      ev.preventDefault();
      var chat_message = {
        payload: {
          id: socialScreenplayUser.id
         ,name: socialScreenplayUser.name
         ,message: jQuery(this).val()
         ,profile_pic_url: socialScreenplayUser.profile_pic.url
        }
       ,action: 'chat'
      };
      newChatMessage(chat_message.payload);
      jQuery('#input_chat_message').get(0).value = '';
      socket.emit('chat', JSON.stringify(chat_message));
    }
  });
  jQuery('#pad_playback').click(function(){
    doPlayback();
    return false;     
  });
  var editing_lines = jQuery('#editable_content').children('p');
  for (var i=0;i<editing_lines.length;i++) {
    var uuid = jQuery(editing_lines[i]).attr('data-uuid');
    var local_text_value = jQuery(editing_lines[i]).text();
    var cssClass = jQuery(editing_lines[i]).get(0).className;
    local_shadow_order.push(uuid);
    local_shadow[uuid] = { 'content': local_text_value, 'cssClass': cssClass };
  };
  window.setInterval(inspectLineChanges, 99);
  window.setInterval(checkForUpdates, 99);
});

jQuery.cookie = function (key, value, options) {
  // key and at least value given, set cookie...
  if (arguments.length > 1 && String(value) !== "[object Object]") {
    options = jQuery.extend({}, options);

    if (value === null || value === undefined) {
      options.expires = -1;
    }

    if (typeof options.expires === 'number') {
      var days = options.expires, t = options.expires = new Date();
      t.setDate(t.getDate() + days);
    }

    value = String(value);

    return (document.cookie = [
      encodeURIComponent(key), '=',
      options.raw ? value : encodeURIComponent(value),
      options.expires ? '; expires=' + options.expires.toUTCString() : '', // use expires attribute, max-age is not supported by IE
      options.path ? '; path=' + options.path : '',
      options.domain ? '; domain=' + options.domain : '',
      options.secure ? '; secure' : ''
    ].join(''));
  }

  // key and possibly options given, get cookie...
  options = value || {};
  var result, decode = options.raw ? function (s) { return s; } : decodeURIComponent;
  return (result = new RegExp('(?:^|; )' + encodeURIComponent(key) + '=([^;]*)').exec(document.cookie)) ? decode(result[1]) : null;
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
      current_user.name = current_user.fb_data.first_name 
        + ' ' + current_user.fb_data.last_name.substr(0,1);
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
      current_user.id = 'em-' + current_user.em_data.email;
      current_user.name = current_user.em_data.email;
    }      
  };
  this.getLoginCredential = function(current_user) {
    var credential = {
      id: current_user.id
    };
    if (current_user.using_facebook) {
      credential.using_facebook = true;
    }
    if (current_user.using_twitter) {
      credential.using_twitter = true;
    }
    if (current_user.using_email) {
      credential.using_email = true;
    }
    credential.is_credential = true;
    return credential;
  };
  return this;
}();

var PageHandlerModule = function() {
  var pageHeight = 845, currentPage = 1, pageSeparators = []; 

  this.createPages = function() {
    var lines = $('#editable_content p');
    var totalHeight = 30;
    var pageMultiple = 1;
    var separator_html = '<a title="' + 1 + '" href="javascript: PageHandlerModule.pageSelector.gotoPage(' + 1 + ')"><img src="/images/page_icon.gif"></a>';
    for (var i=0;i<lines.length;i++) {
      var line = jQuery(lines[i]);
      jQuery(lines[i]).removeClass('page_separator');
      totalHeight = totalHeight + line.outerHeight() + parseInt(line.css("margin-top").replace("px", ""), 10) + parseInt(line.css("margin-bottom").replace("px", ""), 10);
      if (i!== 0 && lines[i+1] && totalHeight > pageHeight * pageMultiple) {
        pageSeparators.push(lines[i-1]);
        jQuery(lines[i-1]).addClass('page_separator');
        //this.pageSelector.addPage(lines[i-1]);
        separator_html += '<a title="' + (pageMultiple + 1) + '" href="javascript: PageHandlerModule.pageSelector.gotoPage(' + (pageMultiple + 1) + ')"><img src="/images/page_icon.gif"></a>';  
        pageMultiple +=1;
      }
    }
    this.pageSelector.render(separator_html);
  };

  this.pageSelector = {
    gotoPage: function(pageNum) {
      if (pageNum === 1) {
        $('#editable_content').scrollTo(0);
      }
      else {
        var line = $($('.page_separator')[pageNum - 2]);
        $('#editable_content').scrollTo(0);
        var margin = parseInt(line.css("margin-bottom").replace("px", ""), 10);
        $('#editable_content').scrollTo(line.offset().top + line.outerHeight() + margin - 95);
      }
    }
   ,render: function(separator_html) {
      $('#pageSelector').jqDock('destroy');
      $('#pageSelector').html(separator_html);
      var opts = { align: 'top'
       ,size: 20
       ,labels: 'mc'
       ,source: function(i) { return this.src.replace(/gif$/,'png'); }
      };
      $('#pageSelector').jqDock(opts);
    }
  };

  return this;
}();


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


/**
 * jQuery.ScrollTo - Easy element scrolling using jQuery.
 * Copyright (c) 2007-2009 Ariel Flesler - aflesler(at)gmail(dot)com | http://flesler.blogspot.com
 * Dual licensed under MIT and GPL.
 * Date: 5/25/2009
 * @author Ariel Flesler
 * @version 1.4.2
 *
 * http://flesler.blogspot.com/2007/10/jqueryscrollto.html
 */
;(function(d){var k=d.scrollTo=function(a,i,e){d(window).scrollTo(a,i,e)};k.defaults={axis:'xy',duration:parseFloat(d.fn.jquery)>=1.3?0:1};k.window=function(a){return d(window)._scrollable()};d.fn._scrollable=function(){return this.map(function(){var a=this,i=!a.nodeName||d.inArray(a.nodeName.toLowerCase(),['iframe','#document','html','body'])!=-1;if(!i)return a;var e=(a.contentWindow||a).document||a.ownerDocument||a;return d.browser.safari||e.compatMode=='BackCompat'?e.body:e.documentElement})};d.fn.scrollTo=function(n,j,b){if(typeof j=='object'){b=j;j=0}if(typeof b=='function')b={onAfter:b};if(n=='max')n=9e9;b=d.extend({},k.defaults,b);j=j||b.speed||b.duration;b.queue=b.queue&&b.axis.length>1;if(b.queue)j/=2;b.offset=p(b.offset);b.over=p(b.over);return this._scrollable().each(function(){var q=this,r=d(q),f=n,s,g={},u=r.is('html,body');switch(typeof f){case'number':case'string':if(/^([+-]=)?\d+(\.\d+)?(px|%)?$/.test(f)){f=p(f);break}f=d(f,this);case'object':if(f.is||f.style)s=(f=d(f)).offset()}d.each(b.axis.split(''),function(a,i){var e=i=='x'?'Left':'Top',h=e.toLowerCase(),c='scroll'+e,l=q[c],m=k.max(q,i);if(s){g[c]=s[h]+(u?0:l-r.offset()[h]);if(b.margin){g[c]-=parseInt(f.css('margin'+e))||0;g[c]-=parseInt(f.css('border'+e+'Width'))||0}g[c]+=b.offset[h]||0;if(b.over[h])g[c]+=f[i=='x'?'width':'height']()*b.over[h]}else{var o=f[h];g[c]=o.slice&&o.slice(-1)=='%'?parseFloat(o)/100*m:o}if(/^\d+$/.test(g[c]))g[c]=g[c]<=0?0:Math.min(g[c],m);if(!a&&b.queue){if(l!=g[c])t(b.onAfterFirst);delete g[c]}});t(b.onAfter);function t(a){r.animate(g,j,b.easing,a&&function(){a.call(this,n,b)})}}).end()};k.max=function(a,i){var e=i=='x'?'Width':'Height',h='scroll'+e;if(!d(a).is('html,body'))return a[h]-d(a)[e.toLowerCase()]();var c='client'+e,l=a.ownerDocument.documentElement,m=a.ownerDocument.body;return Math.max(l[h],m[h])-Math.min(l[c],m[c])};function p(a){return typeof a=='object'?a:{top:a,left:a}}})(jQuery);
