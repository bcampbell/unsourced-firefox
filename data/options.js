
// show a set of options on the page
function show(opts, builtin_whitelist ) {

  var whitelist = document.getElementById('user-whitelist');
  var whitelist_str = opts.user_whitelist.join("\n");
  whitelist.defaultValue = whitelist_str; // so revert button will work
  $(whitelist).val(whitelist_str);

  var whitelist2 = document.getElementById('builtin-whitelist');
  var builtin_whitelist_str = builtin_whitelist.join("\n");
  whitelist2.defaultValue = builtin_whitelist_str; // so revert button won't screw up the display :-)
  $(whitelist2).val(builtin_whitelist_str);


  var server_addr = document.getElementById('server-addr');
  $(server_addr).val(opts.search_server);

/*    var blacklist = document.getElementById('user-blacklist');
  var blacklist_str = opts.user_blacklist.join("\n");
  blacklist.defaultValue = blacklist_str; // so revert button will work
  $(blacklist).val(blacklist_str);
*/
  $('#debug').prop('checked', opts.debug);
  $('#show-overlays').prop('checked', opts.show_overlays);
}



// read a set of options from the page
function fetch() {
  var opts = {};
  opts.user_whitelist = $("#user-whitelist").val().split("\n");
  opts.user_whitelist = opts.user_whitelist.filter(function(a) {return a.trim()!="";});

//    opts.user_blacklist = $("#user-blacklist").val().split("\n");
//    opts.user_blacklist = opts.user_blacklist.filter(function(a) {return a.trim()!="";});

  opts.search_server = $("#server-addr").val();

  opts.debug = $('#debug').prop('checked');
  opts.show_overlays = $('#show-overlays').prop('checked');
//is(':checked');
  return opts;
}


console.log("options.js: Hello!");
$('#save').click( function(obj) {
  var new_opts = fetch();
// FIREFOX
  self.port.emit("saveOptions", new_opts);
  self.port.emit("byebye"); // all done. close the tab.
// CHROME
//    bg.storeOptions(new_opts);
  return false;
});

self.port.on("bindOptions", show);



