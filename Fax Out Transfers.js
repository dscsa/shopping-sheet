
function createTransferFax(orderId) { //This is undefined when called from Menu

  var gaPinesNpis = [
    "1023494135",
    "1962993519",
    "1356747570",
    "1225534670",
    "1205334737",
    "1689611618",
    "1730398496",
    "1467632851",
    "1700254364",
    "1417461831",
    "1497111207",
    "1861745994",
    "1558389940",
    "1609395110"
  ]

  var gaPinesLNames = JSON.stringify([
    "Anderson",
    "Abt",
    "Stoyle",
    "Alligood",
    "Edelen",
    "Lehman",
    "Sun",
    "Drury",
    "Battle",
    "Rudolf-Watson",
    "Barrow",
    "McCoy",
    "Dickson",
    "Thompson",
    "Harris"
  ])

  var sheet = getSheet(null, 'A', 2) //allow to work for archived shopping sheets as well
  order = sheet.rowByKey(orderId)    //Defaults to getting active row if OrderID is undefined

  var isGaPines = order.$Coupon == 'georgiapinescsb' ? 'COUPON MATCH: georgiapinescsb': false

  //TODO we should not rely on "transferred" magic (and user-facing!) string.  Need to mark this in the json.
  order.$Drugs = order.$Drugs.filter(function(drug) {
    var nameMatch = ~ gaPinesLNames.indexOf(drug.$ProviderName)
    var npiMatch  = ~ gaPinesNpis.indexOf(drug.$Npi)

    if (nameMatch && npiMatch) isGaPines = 'NAME AND NPI MATCH: '+drug.$ProviderName+' '+drug.$Npi
    else if (nameMatch) isGaPines = 'NAME MATCH: '+drug.$ProviderName
    else if (npiMatch) isGaPines = 'NPI MATCH: '+drug.$Npi

    return drug.$InOrder && drug.$Msg && ~ drug.$Msg.indexOf('transferred')
  })

  if (isGaPines)
    sendEmail('adam@sirum.org,kiah@sirum.org,support@goodpill.org', "Potential GA Pines Order #"+order.$OrderId, "Potential GA Pines Order #"+order.$OrderId+". "+isGaPines)

  if ( ! order.$Drugs.length) return

  debugEmail('Sending Transfer Out Fax', orderId, order)

  var fax = mergeDoc("Transfer Out Fax v1", "Transfer #"+order.$OrderId, "Transfer Outs", order)

  var res = sendSFax('18882987726', fax.getAs(MimeType.PDF))

  fax.setName((res.isSuccess ? "Faxed" : "Error") + ": Transfer #"+order.$OrderId)
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
  //var toFax = '18882987726'
  var url   = "https://api.sfaxme.com/api/SendFax?token=" + encodeURIComponent(token) + "&ApiKey=" + encodeURIComponent(SFAX_KEY) + "&RecipientName=" + encodeURIComponent('Good Pill Pharmacy - Active')  + "&RecipientFax=" + encodeURIComponent(toFax) //+ '&SenderFaxNumber=18557916085' //"&OptionalParams=" + encodeURIComponent('SenderFaxNumber=18557916085')

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
