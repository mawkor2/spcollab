var socket = io.connect()
 ,loginDialog = null
 ,modalToggle = true
 ,snapshotVersion = null;

function loadSnapshot(version) {
  document.getElementById('snapshot_frame').src = '/snapshot/?version=' + version;
  snapshotVersion = version;
};

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
      current_user.id = 'em-' + generateUUID();
      current_user.name = current_user.email;
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

function openFailDialog() {
  $('#login_fail_dialog').modal({onOpen: function (dialog) {
    dialog.overlay.fadeIn('slow', function () {
      dialog.container.slideDown('slow', function () {
        dialog.data.fadeIn('slow');
      });
    });
  }});
}

$(document).ready(function() {
  jQuery(document.getElementById('snapshot')).bind('click', function() {
    socket.emit('snapshot');
  });
  $('#btn_genre').bind('click', function() {
    var genre = document.getElementById('input_genre').value;
    socket.emit('set genre', JSON.stringify({'genre':genre}));    
  });
  $('#btn_script_length').bind('click', function() {
    var script_length = document.getElementById('input_script_length').value;
    socket.emit('set script length', JSON.stringify({'script_length':script_length}));
  });
  if (jQuery(document.getElementById('countdown')).text() === '0:0:0:0') {

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
        alert('The countdown has ended! Editing is disabled until the next round.');
      }
     ,currentDate);
  }
  jQuery(document.getElementById('revert')).bind('click', function(){
    if (snapshotVersion) {
      socket.emit('revert', JSON.stringify({'revert':{'version':snapshotVersion}}));
    }
  });
  jQuery(document.getElementById('set_countdown')).bind('click', function(){
    var days = document.getElementById('countdown_days').value;
    if (typeof +days !== "number") {
      alert('days must be a number');
      return;
    }
    var currentDate = new Date();
    var targetDate = (new Date()).addDays(days);
    countdown = new Countdown(
      targetDate 
     ,function() {
        jQuery(document.getElementById('countdown')).text(countdown.toString())
      }
     ,function() {
        alert('The countdown has ended! Editing is disabled until the next round.');
      }
     ,currentDate);
    socket.emit('set countdown', JSON.stringify({days: days}));
  });
  if (false) {
 // if (!socialScreenplayUser) {
    
	  $('#login_dialog').modal({minHeight: 296, minWidth: 512,onOpen: function (dialog) {
      dialog.overlay.fadeIn('slow', function () {
	      dialog.container.slideDown('slow', function () {
		      dialog.data.fadeIn('slow');
	      });
      });
    }, onClose: function(dialog) {
        dialog.data.fadeOut('slow', function () {
	        dialog.container.slideUp('slow', function () {
		        dialog.overlay.fadeOut('slow', function () {
			        $.modal.close(); 
              if (modalToggle) {
                setTimeout(openFailDialog, 200);
              }
              modalToggle = true;
		        });
	        });
        });

    }});

    $('.fb_button').bind('click', function() {
      if (!document.getElementById('tac').checked) {
        alert('You must agree to the terms and conditions to log in.');
        return;
      };
      modalToggle = false;
      $.modal.close();
      FB.login(function(response) {
        if (response.authResponse) {
          jQuery('#editable_content').unbind();
          FB.api('/me', function(response) {
            var fb_id = response.id;
            current_user.using_facebook = true;
            current_user.fb_data = response;
            User.initialize(current_user);
            var cookie = JSON.stringify({
              using_facebook: true
             ,id: current_user.id
            });
            jQuery.cookie('user_info', cookie);
            showStatus(current_user.name, current_user.profile_pic.url);
            current_user.online = true;
            socket.emit('login', JSON.stringify(current_user));
          });
        } else {
          $('#login_fail_dialog').modal({onOpen: function (dialog) {
	          dialog.overlay.fadeIn('slow', function () {
		          dialog.container.slideDown('slow', function () {
			          dialog.data.fadeIn('slow');
		          });
	          });
          }});
        }
      }, {scope: 'email'});  
    });
  }
  else {
    // valid user
    /*
    var loginCred = getLoginCredential(socialScreenplayUser);
    showStatus(socialScreenplayUser.name, socialScreenplayUser.profile_pic.url);
    socket.emit('login', JSON.stringify(loginCred));
    */
  }
});


function showStatus(name, profilePicUrl) {
  var statusElem = document.getElementById('status');
  jQuery(statusElem).html('');
  var welcomeElem = document.createElement('span');
  jQuery(welcomeElem).text('Welcome, ' + name + '!');
  jQuery(welcomeElem).addClass('welcome');
  jQuery(statusElem).append(profilePicElem);
  var profilePicElem = document.createElement('img');
  profilePicElem.src = profilePicUrl;
  jQuery(profilePicElem).addClass('status_pic');
  jQuery(statusElem).append(welcomeElem);
  jQuery(statusElem).append(profilePicElem);
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



