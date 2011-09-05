$("#editable_content").keydown(function(ev){
    //don't delete the beyond p
    if(ev.keyCode == 8 || ev.keyCode == 46){
      var editing_lines = $("#editable_content").children("p");
      var editing_lines_html = $(editing_lines[0]).html();
      if(editing_lines.length == 1 && (editing_lines_html === "" || 
        editing_lines_html === '<br>')) {
        $(editing_lines[0]).html("&nbsp;");
        return false;
      }
    }
});

// disallow copy/paste
$("#editable_content").bind('paste', function(e) {
  alert('Sorry, copy paste is not allowed.');
  e.preventDefault();
  return false;
});

var twitterId = 0;
var loginDialog = null;
var modalFailToggle = true;
var modalEmailToggle = false;

function openFailDialog() {
  $('#login_fail_dialog').modal({onOpen: function (dialog) {
    dialog.overlay.fadeIn('slow', function () {
      dialog.container.slideDown('slow', function () {
        dialog.data.fadeIn('slow');
      });
    });
  }});
};

function openEmailDialog() {
  $('#login_email_dialog').modal({onOpen: function (dialog) {
    dialog.overlay.fadeIn('slow', function () {
      dialog.container.slideDown('slow', function () {
        dialog.data.fadeIn('slow');
      });
    });
  }});
};

$(document).ready(function() {
  if (!socialScreenplayUser) {
    $('#editable_content').attr('contenteditable', 'false');
    document.getElementById('key').style.display = 'block';
    $('#editable_content').bind('click', function() {

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
                if (modalEmailToggle) {
                  modalEmailToggle = false;
                  modalFailToggle = true;
                  setTimeout(openEmailDialog, 200);
                } else if (modalFailToggle) {
                  modalFailToggle = true;
                  modalEmailToggle = false;
                  setTimeout(openFailDialog, 200);
                } else {
                  modalFailToggle = true;
                  modalEmailToggle = false;
                }
			        });
		        });
	        });

      }});

    });
      
    jQuery(document.getElementById('btn_set_email')).bind('click', function(){
      var email = document.getElementById('email').value;       
      // login
      if (/^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/.test(email)) {
        $.modal.close();
        current_user.using_email = true;
        current_user.em_data = {email: email};
        User.initialize(current_user);
        var cookie = JSON.stringify({
          using_email: true
         ,id: current_user.id
        });
        jQuery.cookie('user_info', cookie);
        showStatus(current_user.name, current_user.profile_pic.url); 
        current_user.online = true;  
        socket.emit('login', JSON.stringify(current_user));
        $('#editable_content').attr('contenteditable', 'true');
        document.getElementById('key').style.display = 'none';
        socialScreenplayUser = current_user;
      }
    });
    $('.fb_button').bind('click', function() {
      if (!document.getElementById('tac').checked) {
        alert('You must agree to the terms and conditions to log in.');
        return;
      };
      modalFailToggle = false;
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
            $('#editable_content').attr('contenteditable', 'true');
            document.getElementById('key').style.display = 'none';
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
    $('.tw_button').bind('click', function() {
      if (!document.getElementById('tac').checked) {
        alert('You must agree to the terms and conditions to log in.');
        return;
      };
      document.location.href = twitterUrl;
    });
    $('.em_button').bind('click', function() {
      if (!document.getElementById('tac').checked) {
        alert('You must agree to the terms and conditions to log in.');
        return;
      };
      modalEmailToggle = true;
      modalFailToggle = false;
      $.modal.close();
    });
  }
  else {
    // valid user
    var loginCred = getLoginCredential(socialScreenplayUser);
    showStatus(socialScreenplayUser.name, socialScreenplayUser.profile_pic.url);
    socket.emit('login', JSON.stringify(loginCred));
    var statusElem = document.getElementById('status');
    // do something with status
  }
});

/*
document.execCommand('insertBrOnReturn', false, false);
document.execCommand("styleWithCSS", false, false);

try {
  document.execCommand("styleWithCSS", 0, false);
} catch (e) {
  try {
    document.execCommand("useCSS", 0, true);
  } catch (e) {
      try {
       document.execCommand('styleWithCSS', false, false);
      }
      catch (e) {
      }
  }
}

*/

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

function handleEnter() {
  var node;
  var tagFilter = function(elem){ return elem.tagName=='P' && elem.parentNode.id === 'editable_content'; }; //(1)  
  if (!(node = getContaining(window, tagFilter))) {
    return true;
  };
  node = node.previousSibling;
  var nodeContent = $(node).text();
  if (node.className === "parenthetical")
  {
    var nextNode = node.nextSibling;
    if (nextNode && nextNode.className === "dialogue")
    {
      caretPosition(nextNode, 0);
    }
    else
    {
      nextNode.className = 'dialogue';
      caretPosition(nextNode, 0);
      return false;
    }
  }
  else if (node.className === "character")
  {
    var nextNode = node.nextSibling;
    if (typeof nextNode === '[object Text]') {
      nextNode = nextNode.nextSibling;
    }
    if (nextNode && nextNode.className === "dialogue")
    {
      caretPosition(nextNode, 0);
    }
    else
    {
      nextNode.className = 'dialogue';
      caretPosition(nextNode, 0);
      return false;
    }
  }
  else if (node.className === "dialogue")
  {
    var nextNode = node.nextSibling;
    if (typeof nextNode === '[object Text]') {
      nextNode = nextNode.nextSibling;
    }
    if (nextNode && nextNode.className === "character")
    {
      caretPosition(nextNode, 0);
    }
    else
    {
      nextNode.className = 'character';
      caretPosition(nextNode, 0);
      return false;
    }
  }
  else if (node.className === "transition")
  {
    var nextNode = node.nextSibling;
    if (nextNode && nextNode.className === "sceneHeading")
    {
      caretPosition(nextNode, 0);
    }
    else
    {
      nextNode.className = 'sceneHeading';
      caretPosition(nextNode, 0);
      return false;
    }
  }
  else if (node.className === "sceneHeading")
  {
    var nextNode = node.nextSibling;
    if (nextNode && nextNode.className === "action")
    {
      caretPosition(nextNode, 0);
    }
    else
    {
      nextNode.className = 'action'; 
      caretPosition(nextNode, 0);
      return false;
    }
    return true;
  }
}

function caretPosition(elem, position) {
  if (position !== undefined) {
	  if (elem.setSelectionRange) {  
		  elem.focus();  
		  elem.setSelectionRange(position, position);
	  } else if (elem.createTextRange) {  
		  var range = elem.createTextRange();
		  range.move("character", position);  
		  range.select(); 
	  } else if(window.getSelection){
		  s = window.getSelection();
		  var r1 = document.createRange();
		  var walker = document.createTreeWalker(elem, NodeFilter.SHOW_ELEMENT, null, false);
		  var p = position;
		  var n = elem;
		  r1.setStart(n, p);
		  r1.setEnd(n, p);
		  s.removeAllRanges();
		  s.addRange(r1);
	  } else if (document.selection) {
		  var r1 = document.body.createTextRange();
		  r1.moveToElementText(elem);
		  r1.setEndPoint("EndToEnd", r1);
		  r1.moveStart('character', position);
		  r1.moveEnd('character', position-elem.innerText.length);
		  r1.select();
	  } 
  }
  else {
    if (elem.setSelectionRange) {
	    elem.focus();
	    elem.setSelectionRange(position,position);
    }
    else if (elem.createTextRange) {
	    var range = elem.createTextRange();
	    range.collapse(true);
	    range.moveEnd('character', position);
	    range.moveStart('character', position);
	    range.select();
    }
  }
}

$('#editable_content').keyup(function(e) {
  if (e.keyCode === 13) {
    setTimeout(handleEnter, 100);
  }      
});
