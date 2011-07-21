importScripts('diff_match_patch_uncompressed.js');

var dmp = new diff_match_patch();

onmessage = function(ev) {
  var uuid = ev.data['uuid'];
  var cssClass = ev.data['cssClass'];
  var uid = ev.data['user_id'];
  var patch = ev.data['patch'];
  var local_text = ev.data['local_text'];
  var local_shadow = ev.data['local_shadow'];

  var local_text_patch = dmp.patch_apply(patch, local_text);
  var local_shadow_patch = dmp.patch_apply(patch, local_shadow);
  postMessage([uuid, uid, local_text_patch[0], local_shadow_patch[0], cssClass]);
}
