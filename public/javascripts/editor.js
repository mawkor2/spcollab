function createEditor() {

  function Command(command, editDoc) {
	  this.execute = function() {
		  editDoc.execCommand(command, false, null); 
	  };
	  this.queryState = function() {
		  return editDoc.queryCommandState(command);
	  };
  }

  function ValueCommand(command, editDoc) {
	  this.execute = function(value) {
		  editDoc.execCommand(command, false, value); 
	  };
	  this.queryValue = function() {
		  return editDoc.queryCommandValue(command);
	  };
  }

  function TogglCommandController(command, elem) {	
	  this.updateUI = function() {
		  var state = command.queryState();
		  elem.className = state?"active":"";
	  }
	  var self = this;
	  elem.unselectable = "on"; // IE, prevent focus
	  bindEvent(elem, "mousedown", function(evt) { 
		  // we cancel the mousedown default to prevent the button from getting focus
		  // (doesn't work in IE)
		  if (evt.preventDefault) evt.preventDefault();
	  });		
	  bindEvent(elem, "click", function(evt) { 
		  command.execute(); 	
		  updateToolbar();
	  });
  }
  function ValueSelectorController(command, elem) {
	  this.updateUI = function() {
		  var value = command.queryValue();
		  elem.value = value;
	  }
	  var self = this;
	  elem.unselectable = "on"; // IE, prevent focus		
	  bindEvent(elem, "change", function(evt) { 
      alert('ddchange');
		  editWindow.focus();
		  command.execute(elem.value);	
		  updateToolbar();
	  });	
  }

  function CSSValueSelectorController(command, elem) {
	  this.updateUI = function() {
		  var value = command.queryValue();
		  elem.value = value;
	  }
	  var self = this;
	  elem.unselectable = "on"; // IE, prevent focus		
	  bindEvent(elem, "change", function(evt) { 
		  command.execute(elem.value);	
		  updateToolbar();
      document.getElementById('editable_content').focus();
	  });	
  }

  function CssClassCommand(editDoc) {
	  var tagFilter = function(elem){ return elem.tagName === 'P' && elem.parentNode.id === 'editable_content'; }; //(1)    
    this.execute = function(cssClass) {
      var elem = getContaining(editWindow, tagFilter); //(2) 
      // TODO cross browser this guy    
      elem.className = cssClass;
    };
    
    this.queryState = function() {
      return false;  //(7)
    };

	  this.queryValue = function() {
      var elem = getContaining(editWindow, tagFilter);
      if (elem && elem.className) {
        return elem.className;
      }
      return null;
	  };
  }
	

	var editWindow = window;
	var editDoc = document;
	var updateListeners = [];
  var editNode = document.getElementById('editable_content');
	
	var toolbarCommands = [
		["boldButton", TogglCommandController, new Command("Bold", editDoc)], 
		["italicButton", TogglCommandController, new Command("Italic", editDoc)],
    ["cssClassSelector", CSSValueSelectorController, new CssClassCommand(editDoc)]
	];
		
	//for (var ix=0; ix<toolbarCommands.length;ix++) {
	//	var binding = toolbarCommands[ix];
	toolbarCommands.map(function(binding) {
		var elemId = binding[0], ControllerConstructor = binding[1], command=binding[2];
		var elem = document.getElementById(elemId);	
		var controller = new ControllerConstructor(command, elem);		
		updateListeners.push(controller);
	});
	
	function updateToolbar() { 
		updateListeners.map(function(controller){
			controller.updateUI();
		});
	};	
	
	bindEvent(editNode, "keyup", updateToolbar);
	bindEvent(editNode, "mouseup", updateToolbar); 
}
bindEvent(window, "load", createEditor);
