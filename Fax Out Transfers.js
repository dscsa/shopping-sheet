function getToken(){
  var timestr = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss").replace(" ","T") + "Z"
  var raw = "Username="+SFAX_USER+"&ApiKey="+SFAX_KEY+"&GenDT="+timestr+"&"
  Logger.log('TOKEN '+raw)
  var token = sjcl.encrypt(SFAX_SECRET,raw)
  Logger.log('Encrypted Token '+ typeof token + ' ' + token)
  return JSON.parse(token).ct
}

//Given the info from an SFax ping, puts together an API request to them, and process the full info for a given fax
//https://stackoverflow.com/questions/26615546/google-apps-script-urlfetchapp-post-file
//https://stackoverflow.com/questions/24340340/urlfetchapp-upload-file-multipart-form-data-in-google-apps-script
function sendSFax(){
  var token = getToken()
  var file  = DriveApp.getFileById("1lyRpFl0GiEvj5Ixu-BwTvQB-sw6lt3UH").getAs(MimeType.PDF)
  var bytes = file.getBytes()
  var toFax = '18557916085'
  var url   = "https://api.sfaxme.com/api/SendFax?token=" + encodeURIComponent(token) + "&ApiKey=" + encodeURIComponent(SFAX_KEY) + "&RecipientName=" + encodeURIComponent('ADAM TEST')  + "&RecipientFax=" + encodeURIComponent(toFax)
  Logger.log('URL '+ url + ' ' + bytes.length)
  
  var headers = {
    'Content-Disposition': 'attachment; filename="'+ file.getName() +'"',
  };
  
  var opts  = {
    method:'POST',
    url:url,
    payload:bytes, 
    headers:headers,
    //contentType: 'application/json',
    //muteHttpExceptions:true,
    contentLength:bytes.length
  }

  try{

    var req = UrlFetchApp.getRequest(url,opts);   // (OPTIONAL) generate the request so you
    Logger.log("Request payload: " + JSON.stringify(req)); // can examine it (useful for debugging)
    
    var res = UrlFetchApp.fetch(url, opts)
    Logger.log('sendSFax res: ' + JSON.stringify(res) + ' || ' + res.getResponseCode() + ' || ' + JSON.stringify(res.getHeaders()) + ' || ' + res.getContentText())
    
    return extractFaxInfo(JSON.parse(res.getContentText()))
  } catch(err){
    Logger.log('sendSFax err' + err)
  }
}

//Given the response object from SFax's InboundFaxInfo call, returns an object with relavant pieces and especially tracking numbers extracted

function extractFaxInfo(sfax_response_obj){
  Logger.log(sfax_response_obj)
  return sfax_response_obj
}
