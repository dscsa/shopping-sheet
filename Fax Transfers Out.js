
function createTransferFax(orderId) { //This is undefined when called from Menu

  var sheet = getSheet('Shopping', 'A', 2) //allow to work for archived shopping sheets as well
  order = sheet.rowByKey(orderId)    //Defaults to getting active row if OrderID is undefined

  //TODO we should not rely on "transferred" magic (and user-facing!) string.  Need to mark this in the json.
  if ( ! order.$Drugs.filter) {
    debugEmail('order.$Drugs.filter is not a function', typeof order.$Drugs, order.$Drugs, order)
  }

  //order.$Drugs
  var drugs = order.$Drugs.filter(function(drug) {
    return hasDrugStatus(drug, 'NOACTION_WILL_TRANSFER') || hasDrugStatus(drug, 'NOACTION_WILL_TRANSFER_CHECK_BACK')
  })

  if ( ! drugs.length || ! LIVE_MODE) return

  order.$Drugs = drugs

  var fax = mergeDoc("Transfer Out Fax v1", "Transfer #"+order.$OrderId, "Transfer Outs", order)
  var pdf = fax.getAs(MimeType.PDF)

  if (order.$Pharmacy.fax) {
    var faxTo = order.$Pharmacy.fax.replace(/\D/g, '')
    if (faxTo.length == 10) faxTo = '1'+faxTo
    var res = sendSFax('18882987726', pdf) //(faxTo, pdf)
    var success = res && res.isSuccess ? "External" : "Error External"
    sendEmail('adam@sirum.org,cindy@goodpill.org', success + ' Transfer Out Fax', res.message+'. OrderId: '+orderId+'. See the <a href="'+fax.getUrl()+'">fax here</a>')
  } else {
    var res = sendSFax('18882987726', pdf)
    var success = res && res.isSuccess ? "Internal" : "Error Internal"
  }

  fax.setName(success + ": Transfer #"+order.$OrderId)

  if (res && ! res.isSuccess)
    debugEmail(success + ' Transfer Out Fax', 'OrderId', orderId, 'isSuccess', res.isSuccess, fax.getUrl(), 'res', res, 'order', order)
}

function getToken(){

  var raw = "Username="+SFAX_USER+"&ApiKey="+SFAX_KEY+"&GenDT="+(new Date).toJSON()
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
function sendSFax(toFax, blob){

  var token = getToken()
  //var blob  = DriveApp.getFileById("1lyRpFl0GiEvj5Ixu-BwTvQB-sw6lt3UH").getBlob()

  var url = "https://api.sfaxme.com/api/SendFax?token=" + encodeURIComponent(token) + "&ApiKey=" + encodeURIComponent(SFAX_KEY) + "&RecipientName=" + encodeURIComponent('Good Pill Pharmacy - Active')  + "&RecipientFax=" + encodeURIComponent(toFax)

  if (toFax != '18882987726') //Have external faxes come from Good Pill and gointo our sent folder
    url += "&OptionalParams=" + encodeURIComponent('SenderFaxNumber=18882987726')

  var opts  = {
    method:'POST',
    url:url,
    payload:{file:blob}
  }

  try{

    //var req = UrlFetchApp.getRequest(url,opts);   // (OPTIONAL) generate the request so you
    //Logger.log("Request payload: " + JSON.stringify(req)); // can examine it (useful for debugging)

    var res = UrlFetchApp.fetch(url, opts)
    Logger.log('sendSFax res: ' + JSON.stringify(res) + ' || ' + res.getResponseCode() + ' || ' + JSON.stringify(res.getHeaders()) + ' || ' + res.getContentText())

    return JSON.parse(res.getContentText()) //{"SendFaxQueueId":"539658135EB742968663C6820BE33DB0","isSuccess":true,"message":"Fax is received and being processed"}

  } catch(err){
    Logger.log('sendSFax err' + err)
    return err
  }
}
function testDecrypt() {
  var token = '8jx9Uhg20DB/L3Fq5YukuFaF3/NkiWKB5PGlXBxsaZqRNCjDlCsUlKRVp++rm7x+Um9by5YTDOxxixJCO/t9loBMP9afTl4u/bdaSt2HqN7MS5lIXliT2OvW9nL6X4Zn' //'8jx9Uhg20DB/L3Fq5YukuFaF3/NkiWKB5PGlXBxsaZqRNCjDlCsUlKRVp++rm7x+Um9by5YTDOxxixJCO/t9lgyp5GyMAlSjagK3j0jl1pf5EY150TmsmHqM1S1VavwD'

   var raw = CryptoJS.AES.decrypt(token, CryptoJS.enc.Utf8.parse(SFAX_SECRET), {
    iv:CryptoJS.enc.Utf8.parse(SFAX_INIT_VECTOR),
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC
  });

  Logger.log(raw.toString(CryptoJS.enc.Utf8))
}
