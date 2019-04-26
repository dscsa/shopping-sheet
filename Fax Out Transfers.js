
function testDecrypt() {
  var token = '8jx9Uhg20DB/L3Fq5YukuFaF3/NkiWKB5PGlXBxsaZqRNCjDlCsUlKRVp++rm7x+Um9by5YTDOxxixJCO/t9loBMP9afTl4u/bdaSt2HqN7MS5lIXliT2OvW9nL6X4Zn' //'8jx9Uhg20DB/L3Fq5YukuFaF3/NkiWKB5PGlXBxsaZqRNCjDlCsUlKRVp++rm7x+Um9by5YTDOxxixJCO/t9lgyp5GyMAlSjagK3j0jl1pf5EY150TmsmHqM1S1VavwD'
  
   var raw = CryptoJS.AES.decrypt(token, CryptoJS.enc.Utf8.parse(SFAX_SECRET), { 
    iv:CryptoJS.enc.Utf8.parse(SFAX_INIT_VECTOR), 
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC
  });
  
  Logger.log(raw.toString(CryptoJS.enc.Utf8))
}

function getToken(){
  
  var timestr = Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd HH:mm:ss").replace(" ","T") + "Z" //(new Date).toJSON()
  var raw = "Username="+SFAX_USER+"&ApiKey="+SFAX_KEY+"&GenDT="+timestr
  Logger.log('TOKEN '+raw)
    
   var token = CryptoJS.AES.encrypt(raw, CryptoJS.enc.Utf8.parse(SFAX_SECRET), { 
    iv:CryptoJS.enc.Utf8.parse(SFAX_INIT_VECTOR), 
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC
    
  });
  
  Logger.log('Encrypted Token '+ typeof token + ' ' + token)
  return token
}



//Given the info from an SFax ping, puts together an API request to them, and process the full info for a given fax
//https://stackoverflow.com/questions/26615546/google-apps-script-urlfetchapp-post-file
//https://stackoverflow.com/questions/24340340/urlfetchapp-upload-file-multipart-form-data-in-google-apps-script
function sendSFax(){
  var token = getToken()
  var blob  = DriveApp.getFileById("1lyRpFl0GiEvj5Ixu-BwTvQB-sw6lt3UH").getBlob()
  var toFax = '18882987726'
  var url   = "https://api.sfaxme.com/api/SendFax?token=" + encodeURIComponent(token) + "&ApiKey=" + encodeURIComponent(SFAX_KEY) + "&RecipientName=" + encodeURIComponent('Good Pill Pharmacy - Active')  + "&RecipientFax=" + encodeURIComponent(toFax) //+ '&SenderFaxNumber=18557916085' //"&OptionalParams=" + encodeURIComponent('SenderFaxNumber=18557916085') 
  
  var opts  = {
    method:'POST',
    url:url,
    payload:{file:blob}
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

//{"SendFaxQueueId":"539658135EB742968663C6820BE33DB0","isSuccess":true,"message":"Fax is received and being processed"}
function extractFaxInfo(sfax_response_obj){
  Logger.log(sfax_response_obj)
  return sfax_response_obj
}
