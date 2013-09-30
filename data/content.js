var log = new LogWrapper(LogWrapper.DEBUG);


// UGH. but need inline styles to trump all else.
// (can't seem to override page styles with injected stylesheets on
// firefox - normal css precedence rules don't seem to apply...
// bug or just me screwing it up? Anyway. Inline styles bypass all that)
var label_style = '\
  display: block; \
  margin: 1em 0; \
  padding: 0.5em; \
  max-width: 16em; \
  font-size: 12px; \
  line-height: 1.1; \
  font-family: Helvetica, Arial, Sans-Serif; \
  color: #000; \
  background-color: #fbd415; \
  border-radius: 0.5em; \
  border: 0.4em solid #F8BB08; \
  transform: translate3d(0,0,0) rotate(-15deg) scale(1); \
  -webkit-transform: translate3d(0,0,0) rotate(-15deg); \
  -moz-transform: translate3d(0,0,0) rotate(-15deg) scale(1); \
  -webkit-transition: all 0.2s ease-in-out; \
  -moz-transition: all 0.2s ease-in-out; \
  ';

var label_icon_style = '\
  width: 32px; \
  height: 32px; \
  display: block; \
  float: left; \
  ';

var label_bod_style = '\
  margin-left: 40px; \
  ';

var label_head_style = '\
  font-size: 120%; \
  font-weight: bold; \
  display: block; \
  ';


var label_template = '\
<div class="unsrced-label" style="'+ label_style + '">\
\
  <img class="unsrced-label-icon" src="{{icon_url}}" alt="{{prettyname}}" style="'+label_icon_style+'" />\
  <div class="unsrced-label-bod" style="'+label_bod_style+'">\
    <div class="unsrced-label-head" style="'+label_head_style+'">WARNING</div>\
    {{description}}\
  </div>\
</div>\
';


/* cheesy little template system, eg "Hello, {{name}}!" */
function render(tmpl, values) {
  var regex = /\{\{\s*(.*?)\s*\}\}/gi;
  return tmpl.replace(regex, function(m,p1) {
    return values[p1];
  });
}



// get or create the unsourced overlay element
function unsrced() {
  var u = document.querySelector('body #unsrced');
  if(u == null) {
    u = document.createElement('div');
    u.id = 'unsrced';
    document.querySelector('body').appendChild(u);
  }
  return u;
}



function showWarningLabels( labels ) {
  log.info("Showing labels",labels);
  var overlay = unsrced();
  for(var idx=0; idx<labels.length; idx++) {
    var label = labels[idx];
    var holder = document.createElement('div');
    holder.innerHTML = render(label_template, label);
    overlay.appendChild(holder.firstChild);
  }

}

function hideWarningLabels() {
/* UNTESTED
  var overlay = unsrced();
  for (var i = overlay.children.length - 1; i >= 0; i--) {
    overlay.removeChild(overlay.children[i]);
  }
*/
}



// recursively search node for strings.
// returns array of matches, of form [node,startpos,endpos,matchingstring]
/*
Based on jquery.highlight work by:
Marshal <beatgates@gmail.com>
Johann Burkard <http://johannburkard.de> <mailto:jb@eaio.com>

MIT license.
 
*/
function searchHTML(node,strings) {
  function reQuote(str) {
    // escape special regexp chars
    return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
  };

    // build strings into a single regexp
    var pats = [];
    for( var i=0; i<strings.length; ++i ) {
      pats.push( '(?:' + reQuote(strings[i]) + ')' );
    }
    var pattxt = "(" + pats.join('|') + ")";
    var pat = new RegExp(pattxt,"gi"); 

    function inner(node) {
      var results = [];
        if (node.nodeType === 3) { // 3 - Text node
          // NOTE: this relies on regexp having parentheses (ie capturing),
          // so the matching part shows up in the list returned by split()
          m = node.data.split(pat);
          var i=0;
          var pos=0;
          while((i+1)<m.length) {
            // every second item will be matching text
            pos += m[i].length;
            var end = pos + m[i+1].length;
            results.push( [node, pos, end, m[i+1]] );
            pos = end;
            i+=2;
          }
        } else if (node.nodeType === 1 && node.childNodes && !/(script|style)/i.test(node.tagName)) { // 1 - Element node
            for (var i = 0; i < node.childNodes.length; i++) {
                results.push.apply( results, inner(node.childNodes[i]));
            }
        }
        return results;
    }
 
    return inner(node);
};


function searchText(haystack,needles) {
  function reQuote(str) {
    // escape special regexp chars
    return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
  };

  // build strings into a single regexp
  var pats = [];
  for( var i=0; i<needles.length; ++i ) {
    pats.push( '(?:' + reQuote(needles[i]) + ')' );
  }
  var pattxt = "(" + pats.join('|') + ")";
  var pat = new RegExp(pattxt,"gi"); 

  var results = [];
  // NOTE: this relies on regexp having parentheses (ie capturing),
  // so the matching part shows up in the list returned by split()
  m = haystack.split(pat);
  var i=0;
  var pos=0;
  while((i+1)<m.length) {
    // every second item will be matching text
    pos += m[i].length;
    var end = pos + m[i+1].length;
    results.push( [pos, end, m[i+1]] );
    pos = end;
    i+=2;
  }
  return results;
}


// check the content of the page for various stuff
function examinePage() {

  var pd = {};

  pd.indicatorsFound = checkForIndicators();


  // is an og:type metatag present?
  {
    pd.ogType = null;
    var meta_ogtype = document.querySelector('meta[property="og:type"]');
    if( meta_ogtype != null ) {
      if(meta_ogtype.content !== undefined) {
        pd.ogType = meta_ogtype.content;
      }
    }
  }

  // how about a schema.org type?
  {
    var container = document.querySelector('[itemscope][itemtype]')
    if( container != null ) {
      pd.schemaType = container.getAttribute('itemtype');
    } else {
      pd.schemaType = null;
    }
  }

  // hNews?
  {
    hnews = document.querySelector('.hnews')
    if( hnews != null ) {
      pd.hnews = true;
    } else {
      pd.hnews = false;
    }
  }


  var schemaorg_art_types = [
    "http://schema.org/Article",
    "http://schema.org/NewsArticle",
    "http://schema.org/BlogPosting",
    "http://schema.org/ScholarlyArticle",
    "http://schema.org/MedicalScholarlyArticle" ];

  /* now make a call - are we confident it is or isn't an article? */
  pd.isDefinitelyArticle = false;
  pd.isDefinitelyNotArticle = false;

  if(pd.schemaType !== null ) {
    if(schemaorg_art_types.indexOf(pd.schemaType) > -1 ) {
      pd.isDefinitelyArticle = true;
    } else {
      pd.isDefinitelyNotArticle = true;
    }
  }

  if( pd.ogType !== null ) {
    if( pd.ogType=='article' || pd.ogType=='tumblr-feed:entry') {
      pd.isDefinitelyArticle = true;
    }

    if( pd.ogType=='website') {
      pd.isDefinitelyNotArticle = true;
    }
  }

  if( pd.hnews==true ) {
    pd.isDefinitelyArticle = true;
  }

  // could have conflicting info...
  if( pd.isDefinitelyArticle && pd.isDefinitelyNotArticle ) {
    // ignore all!
    pd.isDefinitelyArticle = false;
    pd.isDefinitelyNotArticle = false;
  }

  return pd;
}



// search for text that might indicate an article requires sourcing...
// use readability algorithm to extract text, the main beneit being
// that we're less likely to pick up crap in sidebars/adverts etc...
var checkForIndicators = function() {
    var indicators = {
      "missing_source": [ "scientists have",
        "scientists say",
        "paper published",
        "research suggests",
        "latest research",
        "researchers",
        "the study" ],
      "smelly": [ "online survey",
        "online poll",
        "onepoll",
        "a survey commissioned by" ]
    };

  /* other possibilities:
    "according to a new study"
    "the study"
    "findings"
  */

    var article = '';
    var title = '';
    try {
        ArticleExtractor(window, LogWrapper.CRITICAL);
        var article_document = new ExtractedDocument(document);
        article = article_document.get_article_text();
//        article = standardize_quotes(article, "'", "'", '"', '"');
        //log.info("Article text: ", article);
        title = article_document.get_title();
        //inject_warning_ribbon();
    } catch (e) {
        log.notice("text extraction failed: ", e.message);
        article = '';
        title = '';
    }

    var out = false;
    for (var x in indicators) {
      var matches = searchText(article,indicators[x]);
      if(matches.length>0) {
        for(var i=0; i<matches.length; ++i ) {
          log.info("Indicative of '" + x + "': '" + matches[i][2] + "'"); 
        }
        out = true;
      }
    }

    return out;

  }






/* firefox-specifics */

self.port.on('showWarningLabels', showWarningLabels);
self.port.on('hideWarningLabels', hideWarningLabels);

$(document).ready( function() {

  var pageDetails = examinePage();
  // tell main that we've had a look at the page
  self.port.emit("pageExamined", pageDetails);
});


