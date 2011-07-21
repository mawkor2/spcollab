importScripts('diff_match_patch_uncompressed.js');

var sentDiffs = 0;
var dmp = new diff_match_patch();

onmessage = function(ev){
  var node_id = ev.data[0];
  var previous_text = ev.data[1];
  var current_text = ev.data[2];
  var css_class = ev.data[3];
  var css_class_old = ev.data[4];

  var diff = dmp.diff_main(previous_text, current_text);

  if (diff.length > 2) {
    dmp.diff_cleanupSemantic(diff);
  }

  var patch_list = dmp.patch_make(previous_text, current_text, diff);

  if(patch_list.length > 0 || css_class !== css_class_old) {
    postMessage({'id':node_id, 'changes': patch_list, 'cssClass': css_class});
  }
}
