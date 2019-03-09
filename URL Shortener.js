function shortLink(link) {
  var apiUrl = 'https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key='+SHORT_LINK
  
  var longLink = 'https://y7hja.app.goo.gl/?link='+link+'&efr=1'
  
  var opts = {
    method:'POST',
    payload:JSON.stringify({"longDynamicLink":longLink, "suffix": {"option": "SHORT"}}),
    contentType: 'application/json',
    muteHttpExceptions:true
  }

  try {
    return JSON.parse(UrlFetchApp.fetch(apiUrl, opts).getContentText()).shortLink
  } catch (e) {
    debugEmail('Could not shorten URL', e, link, opts)
  }
}

function testShortLink() {
  var link = shortLink('https://docs.google.com/document/d/1chab3rbma1w-6yTY9inwXgXB2hAd0PTObiz6KjH8VZw/pub?embedded=true')
  Logger.log(link)
  Logger.log(typeof link)
}
