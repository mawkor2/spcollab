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
});/*
document.execCommand('insertBrOnReturn', false, false);
document.execCommand("styleWithCSS", false, false);
  */
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
    handleEnter();
  }      
});
