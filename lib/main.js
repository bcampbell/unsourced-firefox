var widget = require("widget");
var tabs = require("tabs");
var pageMod = require("page-mod");
var Request = require("request").Request;
var Panel = require("panel").Panel;
var MatchPattern = require("match-pattern").MatchPattern;
var data = require("self").data; 

var parseUri = require("parseuri").parseUri;

var news_sites = require("news_sites");
var windows = require("windows");
var SimplePrefs = require("simple-prefs");
var SimpleStorage = require("simple-storage"); 


/* NOTES:
 * we've got a couple of things to track for each augmented page:
 * 1) the lookup request to unsourced.org. We want to kick this off as early
 *    as we can.
 * 2) the state of the page content. We can't display any overlays until the
 *    page is ready.
 * We track the states of these by adding an object to the tab object.
 */



function UnsourcedState(url, guiUpdateFunc) {
  this.url = url;
  this.contentReady = false;
  this._guiUpdateFunc = guiUpdateFunc;

  this.labelDisplayLatch = false; // have the overlay warning labels been displayed yet?

  this.lookupState = "none"; // none, pending, ready, error
  this.lookupResults = null;  // only set if state is 'ready'

  this.pageDetails = null; // set by domReady()
  // might already be a popup active!
  this._guiUpdateFunc(this);
}

UnsourcedState.prototype.lookupFinished = function(lookupResults) {
  console.log("lookupFinished");
  if(this.lookupState=="none" || this.lookupState=="pending") {
    //

    this.lookupResults = lookupResults;    
    this.lookupState = "ready";

    this._guiUpdateFunc(this);
  }
};

UnsourcedState.prototype.lookupError = function() {
  console.log("lookupError");
  this.lookupState = "error";
  this._guiUpdateFunc(this);
};

UnsourcedState.prototype.domReady = function(pageDetails) {
//  console.log("domReady (pageDetails.ogType="+pageDetails.ogType+", pageDetails.indicatorsFound="+pageDetails.indicatorsFound+")" );
  this.pageDetails = pageDetails;
  if(this.contentReady!==true) {
    this.contentReady = true;
    this._guiUpdateFunc(this);
  }
};

UnsourcedState.prototype.startLookup = function() {
  var state = this;
  var search_url = options.search_server + '/api/lookup?url=' + encodeURIComponent(this.url);


  console.log("startLookup("+this.url+")");
  this.lookupState = "pending";
  this._guiUpdateFunc(this);

  // TODO: factor out some cross-browser request code...
  /* firefox version */
  var req = Request({
    url: search_url,
    onComplete: function (response) {
      if( response.status==200) {
        state.lookupFinished(response.json);
      } else {
        state.lookupError();
      }
    }
  }).get();
  /* chrome version */
  /*
  $.ajax({
    type: "GET",
    url: search_url,
    dataType: 'json',
    success: function(result) {
      state.lookupFinished(result);
    },
    error: function(jqXHR, textStatus, errorThrown) {
      state.lookupError();
      console.log("Error:", jqXHR, textStatus, errorThrown);
    }
  });
  */
};


// add a warning label to the current article
UnsourcedState.prototype.addLabel = function(label_id) {
  var state = this;
  var api_url = options.search_server + '/api/addlabel?' +
    "url=" + encodeURIComponent(this.url) + "&" +
    "label=" + encodeURIComponent(label_id);

  /* firefox version */
  var req = Request({
    url: api_url,
    onComplete: function (response) {
      if( response.status==200) {
        var out = response.json;
        if(out.status=='success') {
          // install updated list of labels
          if(state.lookupState=='ready') {
            state.lookupResults.labels = out.labels;
            state.labelDisplayLatch = false; // force new display update
          }
          state._guiUpdateFunc(state);
        } else if(out.status=='not_logged_in') {
          // if we're not logged in, go for the non api path, which
          // will redirect the user through the login process.
          // open in a new tab (TODO: figure out cross-browser way to handle it!)
          req_url = options.search_server + "/addlabel?" + 
            "url=" + encodeURIComponent(state.url) + "&" +
            "label=" + encodeURIComponent(label_id);
          tabs.open(req_url);
        }
      } else {
        // TODO: show a warning?
        console.log("add label failed, http code ", response.status);
      }
    }
  }).get();
}

// return URL for submitting this article to unsourced
UnsourcedState.prototype.getSubmitURL = function() {
  var submit_url = options.search_server + '/addarticle?url=' + encodeURIComponent(this.url);
  return submit_url;
};


// some helpers for use in popup.html template (ashe can only do boolean if statements)
UnsourcedState.prototype.isLookupNone = function() { return this.lookupState == 'none'; };
UnsourcedState.prototype.isLookupReady = function() { return this.lookupState == 'ready'; };
UnsourcedState.prototype.isLookupPending = function() { return this.lookupState == 'pending'; };
UnsourcedState.prototype.isLookupError = function() { return this.lookupState == 'error'; };

UnsourcedState.prototype.isDebugSet = function() { return options.debug; };
UnsourcedState.prototype.getDebugTxt = function() { return JSON.stringify(this,null," "); };

UnsourcedState.prototype.wasArticleFound = function() { return this.lookupState == 'ready' && this.lookupResults.status=='found'; };

UnsourcedState.prototype.isSourcingRequired = function() {
  if( this.wasArticleFound() ) {
    return this.lookupResults.needs_sourcing;
  }
  
  if( this.pageDetails && !this.pageDetails.isDefinitelyNotArticle && this.pageDetails.indicatorsFound ) {
    return true;
  }
  return false;
};





UnsourcedState.prototype.calcWidgetIconState = function() {
  if(this.isSourcingRequired()) {
    return "missingsources";
  }

  if( this.lookupState == 'ready' ) {
    var ad = this.lookupResults;
    if( ad.status=='found') {
      return "sourced";
    }
  }
  return "unsourced";
};



UnsourcedState.prototype.calcWidgetTooltip = function() {
  var tooltip_txt = "";
  switch( this.lookupState ) {
    case "none":
      break;
    case "pending":
      tooltip_txt = "checking unsourced.org";
      break;
    case "ready":
      {
        var ad = this.lookupResults;
        if( ad.status=='found') {
          var src_txt;
          switch(ad.sources.length) {
            case 0: src_txt="no sources"; break;
            case 1: src_txt="1 source"; break;
            default: src_txt="" + ad.sources.length + " sources"; break;
          }
          var label_txt;
          switch(ad.labels.length) {
            case 0: label_txt="no warning labels"; break;
            case 1: label_txt="1 warning label"; break;
            default: label_txt="" + ad.labels.length + " warning labels"; break;
          }
          tooltip_txt = src_txt + ", " + label_txt;
        } else {
          tooltip_txt = "no sources or warning labels";
        } 
      }
      break;
    case "error":
      break;
  }

  if(this.isSourcingRequired()) {
    tooltip_txt = "Sources missing";
  }
  return tooltip_txt;
};




/* end UnsourcedState */







/* extension options - (loaded from storage in startup() and changed via storeOptions() */
options = {};


// returns a function that can test a url against the list of sites
// a leading dot indicates any subdomain will do, eg:
//   .example.com             - matches anything.example.com
// a trailing ... is a wildcard, eg:
//   example.com/news/...    - matches example.com/news/moon-made-of-cheese.html
function buildMatchFn(sites) {

  var matchers = sites.map(function(site) {
    var pat = site;
    var wild_host = (pat[0]=='.');
    var wild_path = (pat.slice(-3)=='...');

    if(wild_host) {
      pat = pat.slice(1);
    }
    if(wild_path) {
      pat = pat.slice(0,-3);
    }

    pat = pat.replace( /[.]/g, "[.]");

    if(wild_host) {
      pat = '[^/]*' + pat;
    }

    pat = "https?://" + pat + '.*';

    return new RegExp(pat);
  });


  return function (url) {
    for (var idx = 0; idx < matchers.length; idx++) {
      var re = matchers[idx];
        if( re.test(url)) {
              return true;
        }
    }
    return false;
  };
}


/**********************************
 * Gray area - public interface, browser-specific implementation
 */

function getBuiltInWhiteList() {
  return news_sites.sites;
}

function getBuiltInBlackList() {
  return ["unsourced.org"];
}

//
function storeOptions(new_options) {
  for (key in new_options) {
    options[key] = new_options[key];
  }
//  console.log("save options: ", options);
// chrome version:
//  chrome.storage.sync.set(options);
  SimpleStorage.storage.options = options;

  // perform any processing the changes require
  if( 'user_whitelist' in new_options ) {
    compileWhitelist();
  }
  if( 'user_blacklist' in new_options ) {
    compileBlacklist();
  }


  if( 'show_overlays' in new_options ) {
    // TODO: update overlays in existing tabs
    // (tried this, but ran into problem with tabs.sendMessage() not returning...
    // try again another time)
  }
}


var onWhitelist = function (location) {
  // This function is replaced by compileWhitelist
  return false;
};

var onBlacklist = function (location) {
  // This function is replaced by compileBlacklist
  return true;
};


// replace onWhitelist with a function that returns true for whitelisted sites
var compileWhitelist = function () {
//  console.log("Recompiling onWhitelist");
  var sites = getBuiltInWhiteList().concat(options.user_whitelist);
  onWhitelist = buildMatchFn(sites);
};

// replace onBlacklist with a function that returns true for blacklisted sites
var compileBlacklist = function () {
//  console.log("Recompiling onBlacklist");
  var sites = getBuiltInBlackList().concat(options.user_blacklist);
  onBlacklist = buildMatchFn(sites);
};







/********************************
 * firefox-specific from here on
 */





/* update the gui to reflect the current state
 * the state tracker object calls this every time something changes
 * (eg lookup request returns)
 */
function update_gui(worker,state)
{
  // ready to add overlays to the webpage (eg warning labels)?
  if(state.lookupState=="ready" && state.contentReady==true && state.labelDisplayLatch!==true) {
    if( state.lookupResults.labels ) {
      if(options.show_overlays) {
        worker.port.emit('showWarningLabels', state.lookupResults.labels);
        state.labelDisplayLatch = true;
      }
    }
  }

  update_widget(worker.tab);
}



// update widget and popup window
function update_widget(tab)
{
  var state = tab.unsourced;
  var widget = unsourcedWidget.getView(tab.window);

  if( state === undefined || state === null ) {
    // not tracking this tab
    widget.port.emit('reconfig', {'icon':  "unsourced"});
    widget.tooltip = "unsourced.org extension";
  } else {
    // reflect the unsourced state
    widget.port.emit('reconfig', {'icon': state.calcWidgetIconState()});
    widget.tooltip = state.calcWidgetTooltip();
  }

  // if the tab is active, update the popup window
  if(tabs.activeTab===tab) {
    unsourcedPopup.port.emit('bind', state, options);
  }
}




// called when all the details for the page have been collected
// - request to unsourced.org has returned (artDetails)
// - the page's html has loaded, DOM constructed and has been checked over for:
//    - indicators in text ("scientists say" etc...)
//    - anything indicating the page is actually an article or some other
//      kind of web page. eg "og:type" meta tags etc...

var show_results = function(worker) {
  var info = worker.tab.unsourced;
  var ad = info.artDetails;   // details from unsourced.org lookup
 
  //var submit_url = restoreOptions().search_server + "/addarticle?url=" + encodeURIComponent(article_url);
  if(tabs.activeTab===worker.tab) {
    updateWidgetView(worker.tab);
  }

  // show any warning labels, overlaid on page
  if(ad.status=='found' && ad.labels.length>0) {
    worker.port.emit('showWarningLabels', ad.labels);
  }
};






function installPageMod() {



  pageMod.PageMod({
    include: [ "http://*", "https://*" ],
    contentScriptWhen: 'start',
    attachTo: 'top',  // only attach to top, not iframes
    contentScriptFile: [ data.url("logwrapper.js"),
      data.url("extractor.js"),
      data.url("jquery.js"),
      data.url("content.js") ],
    contentStyleFile: [data.url("unsourced.css")],
    onAttach: function(worker) {
      var url = worker.url;
      // we store some extra state on the tab
      var state = new UnsourcedState(url, function (state) {update_gui(worker,state);});
      worker.tab.unsourced = state;

      // TODO: move this into UnsourcedState (shared with chrome)
      // if site is whitelisted (and not blacklisted), start a lookup immediately
      if(onWhitelist(url)) {
        console.log("new page, permitted: ", url);
        state.startLookup();
      } else {
        console.log("new page, blocked: ", url);
      }


      worker.port.on('pageExamined', function (pageDetails) {
        state.domReady(pageDetails);

        // TODO: move this into UnsourcedState (shared with chrome)
        // was a lookup started earlier?
        if(state.lookupState=='none') {
          // no. but we know more now we've peeked at the page contents.
          // so maybe a lookup is now appropriate...
          if( state.pageDetails.isDefinitelyArticle === true ) {
            if( !onBlacklist(state.url)) {
              console.log("not blacklisted.", state.url);
              state.startLookup();
            } else {
              console.log("blacklisted.");
            }
          }
        }
      });


    }
  });



  /* setup for our own custom options page */
  pageMod.PageMod({
    include: [ data.url("options.html") ],
    contentScriptWhen: 'end',
    contentScriptFile: [data.url("jquery.js"),data.url("options.js")],
    onAttach: function(worker) {
      worker.port.on('saveOptions', function(new_opts) {
        storeOptions(new_opts);
      });
      worker.port.on('byebye', function() {
        worker.tab.close();
      });
      worker.port.emit("bindOptions", options,getBuiltInWhiteList());
    }
  });
}

unsourcedPopup = Panel( {
  contentURL: data.url("popup.html"),
  contentScriptFile: [data.url("parseuri.js"),data.url("ashe.js"),data.url("popup.js")],
  width: 400,
  height: 300,
});

unsourcedPopup.on('show', function() {
  var state = tabs.activeTab.unsourced;
  if(state === undefined) {
    unsourcedPopup.port.emit('bind', null,options);
  } else {
    unsourcedPopup.port.emit('bind', state,options);
  }
});


unsourcedPopup.port.on('startManualLookup', function() {
  // popup window has requested that a lookup be started
  // (ie user says look it up, even if we're not sure page is an article)
  var state = tabs.activeTab.unsourced;
  state.startLookup();
});


unsourcedPopup.port.on('addLabel', function(label_id) {
  // user has requested a label is to be added to the article in the active tab
  var state = tabs.activeTab.unsourced;

  state.addLabel(label_id);
  unsourcedPopup.hide();


});


unsourcedWidget = widget.Widget({
  id: "unsourced-widget",
  label: " ",
  contentURL: data.url("button.html"),
  contentScriptFile: data.url("button.js"),
  panel: unsourcedPopup
});



function updateWidgetView(tab) {
  var view = unsourcedWidget.getView(tab.window);

  var icon;
  var tooltip;
  var showFunc;

  var submit_url = restoreOptions().search_server + "/addarticle?url=" + encodeURIComponent(tab.url);

  if(tab.unsourced) {
    var state = tab.unsourced;
    if(state._lookupReady) {
      if(state.artDetails.status=='found') {
        // we've got data about this page
        if( state.artDetails.needs_sourcing ) {
          icon = data.url("nag.gif");
          tooltip = "Sources missing";
        } else {
          icon = data.url("sourced.png");
          tooltip = "" + state.artDetails.sources.length + " sources, " + state.artDetails.labels.length + " warning labels"; 
        }
        showFunc = function () {
          unsourcedPopup.port.emit('showDetails', state.artDetails);
        };
      } else {
        // we have no data about this page...
        if(state._contentReady && state.pageDetails.indicatorsFound && !state.isNonArticle()) {
          //... but the page looks like it needs sourcing.
          icon = data.url("nag.gif");
          tooltip = "Sources missing";
          showFunc = function () {
            unsourcedPopup.port.emit('showSourcesMissing', {'submit_url': submit_url});
          };
        } else {
          icon = data.url("unsourced.png");
          tooltip = "No information about this page";
          showFunc = function () {
            unsourcedPopup.port.emit('showNoDetails', {'submit_url': submit_url});
          };
        }
      }
    } else {
      // lookup is still in progress
      icon = data.url("unsourced.png");
      tooltip = "checking for sources and warning labels...";
      showFunc = null;
    }
  } else {
    // not tracking this page (url wasn't on our whitelist, or blank page, or whatever)
    if( /^https?:\/\/.*/i.test(tab.url) ) {

      icon = data.url("unsourced.png");
      tooltip = "No information about this page";
      showFunc = function () {
        unsourcedPopup.port.emit('showNoDetails', {'submit_url': submit_url});
      };
    } else {
      icon = data.url("unsourced.png");
      tooltip = "";
      showFunc = null;
    }
  } 


  if(showFunc) {
    view.panel = unsourcedPopup;
  } else {
    view.panel = null;  // no popup please...
  }

  view.content = '<img width="16" height="16" src="' + icon + '" />';
  view.tooltip = tooltip;

  //view.content = "" + details.sources.length + " sources, " + details.labels.length +" labels";

  unsourcedPopup.on('show', function() {
    if(showFunc) {
      showFunc();
    }
  });
}


var show_options_page = function () {
    for each (var win in windows.browserWindows) {
        for each (var tab in win.tabs) {
            if (tab.url == data.url("options.html")) {
                tab.activate();
                win.activate();
                return;
            }
        }
    }
    tabs.open(data.url("options.html"));
};

SimplePrefs.on("show-options-page", show_options_page);

tabs.on('activate', update_widget );

function startup() {
  var default_options = {
    'search_server':'http://unsourced.org',
    //'search_server':'http://localhost:8888',
    'debug': false,
    'show_overlays': true,
    'user_whitelist': [],
    'user_blacklist': []
  };

/*  CHROME VERSION
    chrome.storage.sync.get(default_options, function(items) {
    options = items;
*/
  if(!SimpleStorage.storage.options)
    SimpleStorage.storage.options = default_options;

  options = SimpleStorage.storage.options;

  // continue startup
  compileWhitelist();
  compileBlacklist();

  installPageMod();

}

startup();




