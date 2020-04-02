
function createTransferFax(order, drugsChanged) { //This is undefined when called from Menu

  if ( ! order) { //Call from Shopping Sheet to make manually
    var sheet = getSheet('Shopping', 'A', 2) //allow to work for archived shopping sheets as well
    order = sheet.rowByKey()    //Defaults to getting active row if OrderID is undefined
  }

  infoEmail('createTransferFax Transfer Out Fax', drugsChanged, order)

  //TODO we should not rely on "transferred" magic (and user-facing!) string.  Need to mark this in the json.
  if ( ! order.$Drugs.filter) {
    debugEmail('order.$Drugs.filter is not a function', typeof order.$Drugs, order.$Drugs, order)
  }

  drugsChanged = JSON.stringify(drugsChanged || '')

  drugs = order.$Drugs.filter(function(drug) {

    drug.$Sig = drug.$Sig.raw || drug.$Sig

    var transferStatus = hasDrugStatus(drug, 'NOACTION_WILL_TRANSFER') || hasDrugStatus(drug, 'NOACTION_WILL_TRANSFER_CHECK_BACK')

    if (drugsChanged == '""') //Because of the JSON Stringify, empty becomes double quotes
      return transferStatus

    //Only Fax Out New Drugs That Were Added
    return ~ drugsChanged.indexOf(drug+' ADDED TO') ? transferStatus : false
  })

  if (drugs.length)
    debugEmail('Transfer Out Fax Called: Fax Sent', 'drugsChanged', drugsChanged, 'drugs', drugs, 'order', order)
  else
    infoEmail('Transfer Out Fax Called: No Fax', 'drugsChanged', drugsChanged, 'drugs', drugs, 'order', order)

  if ( ! drugs.length || ! LIVE_MODE) return

  order.$Drugs = drugs

  var name = "Transfer "+order.$OrderId

  var fax = mergeDoc("Transfer Out Fax v1", name, "Transfer Outs", order)
  //var pdf = fax.getAs(MimeType.PDF) //SFax Help Case: This stopped working on Nov 18th 2019 because Google's Skia PDF library added "rasterization" into that sfax couldn't parse
  //Instead of PDF we have to be a little hacky and use a docx instead
  var docx = UrlFetchApp.fetch('https://docs.google.com/feeds/download/documents/export/Export?id='+fax.getId()+'&exportFormat=docx',
  { headers : { Authorization : 'Bearer '+ ScriptApp.getOAuthToken() }})

  if (order.$Pharmacy.fax) {
    var faxTo = order.$Pharmacy.fax.replace(/\D/g, '')
    if (faxTo.length == 10) faxTo = '1'+faxTo
    var res = sendSFax('18882987726', docx.getBlob(), name) //(faxTo, pdf)
    var success = res && res.isSuccess ? "External" : "Error External"
    //sendEmail('adam@sirum.org,cindy@goodpill.org', success + ' Transfer Out Fax', res.message+'. See the <a href="'+fax.getUrl()+'">fax here</a>')
  } else {
    var res = sendSFax('18882987726', docx.getBlob(), name)
    var success = res && res.isSuccess ? "Internal" : "Error Internal"
  }

  fax.setName("Transfer "+order.$OrderId+" "+success)

  //if (res && ! res.isSuccess)
  debugEmail('createTransferFax '+success, 'isSuccess', res.isSuccess, fax.getUrl(), 'res', res, 'order', order, 'drugsChanged', drugsChanged)
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
function sendSFax(toFax, blob, name){

  var token = getToken()
  //var blob  = DriveApp.getFileById("1lyRpFl0GiEvj5Ixu-BwTvQB-sw6lt3UH").getBlob()

  var url = "https://api.sfaxme.com/api/SendFax?token=" + encodeURIComponent(token) + "&ApiKey=" + encodeURIComponent(SFAX_KEY) + "&RecipientName=" + encodeURIComponent('Good Pill Pharmacy - Active')  + "&RecipientFax=" + encodeURIComponent(toFax)

  if (toFax != '18882987726') //Have external faxes come from Good Pill and gointo our sent folder
    url += "&OptionalParams=" + encodeURIComponent('SenderFaxNumber=18882987726;CoverPageSubject='+name)

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
    res = JSON.parse(res.getContentText()) //{"SendFaxQueueId":"539658135EB742968663C6820BE33DB0","isSuccess":true,"message":"Fax is received and being processed"}
    res.url    = url
    res.base64 = Utilities.base64Encode(blob.getBytes())

    debugEmail('sendSFax', res, opts)


    return res

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

function testCreateTransferFax() {
  return createTransferFax({
     "$OrderId": "31429",
     "$Drugs": [
      {
       "$Name": "CARVEDILOL 12.5MG TAB",
       "$Msg": "was Med Synced to this Order *",
       "$Days": 90,
       "$Qty": 180,
       "$Refills": 0,
       "$Price": 6,
       "$FirstRefill": "",
       "$LastRefill": "2019-12-23",
       "$NextRefill": "2020-03-22",
       "$DaysSinceRefill": 101,
       "$DaysToRefill": -12,
       "$Stock": "HIGH SUPPLY",
       "$RefillsOrig": 1,
       "$RefillsLeft": 1,
       "$RefillsTotal": 1,
       "$AutofillDate": "",
       "$RefillDate": "2020-03-22",
       "$IsRefill": 3,
       "$IsDispensed": false,
       "$DaysSupply": 90,
       "$DispenseQty": 180,
       "$WrittenQty": 180,
       "$RemainingQty": 180,
       "$OriginalQty": 180,
       "$ProviderName": "Michael XXX",
       "$ProviderPhone": "1111111111",
       "$Npi": "1111111111",
       "$Gcn": "22233",
       "$Sig": {
        "raw": "Take 1 tablet by mouth every 12 hours",
        "cleaned": "Take 1 tablet by mouth every 2 times",
        "numDosage": "1",
        "freqNumerator": "2",
        "freqDemoninator": 1,
        "frequency": 1,
        "numDaily": 2
       },
       "$OrderId": "31429",
       "$ScriptNo": "1111111",
       "$InOrder": true,
       "$AddedToOrderBy": "MANUAL",
       "$ManuallyAdded": -2,
       "$InOrderId": "31429-65997-0-1001-10",
       "$ScriptStatus": "Surescripts denied",
       "$ScriptSource": "Phone",
       "$RxChanged": "2020-04-02 14:36:03.780",
       "$RxWritten": "2020-04-02",
       "$RxExpires": "2021-04-02",
       "$Autofill": {
        "rx": 1,
        "patient": 1
       },
       "$Scripts": {
        "ordered": "1111111",
        "high_refills": "1111111",
        "with_refills": "1111111",
        "oldest": "1111111",
        "newest": "1111111"
       },
       "$v2": "Carvedilol 12.5mg",
       "$TotalQty": 13881.3,
       "$RepackQty": 180,
       "$MonthlyPrice": 2,
       "$NoTransfer": 3,
       "$IsPended": false,
       "$Status": "NOACTION_WILL_TRANSFER",
       "$Type": "Estimate Finish Rx"
      },
      {
       "$Name": "* ELIQUIS 5MG TAB",
       "$Msg": "is not due for a refill until 2020-04-30",
       "$Days": 0,
       "$Qty": 0,
       "$Refills": 0.5,
       "$Price": 0,
       "$FirstRefill": "2020-03-16",
       "$LastRefill": "2020-03-16",
       "$NextRefill": "2020-04-30",
       "$DaysSinceRefill": 17,
       "$DaysToRefill": 27,
       "$Stock": "REFILL ONLY",
       "$RefillsOrig": 1,
       "$RefillsLeft": 0.5,
       "$RefillsTotal": 0.5,
       "$AutofillDate": "",
       "$RefillDate": "2020-04-30",
       "$IsRefill": 4,
       "$IsDispensed": "",
       "$DaysSupply": 45,
       "$DispenseQty": 90,
       "$WrittenQty": 180,
       "$RemainingQty": 90,
       "$OriginalQty": 180,
       "$ProviderName": "Michael XXX",
       "$ProviderPhone": "1111111111",
       "$Npi": "1111111111",
       "$Gcn": "70414",
       "$Sig": "Take 1 tablet by mouth twice a day",
       "$OrderId": "31429",
       "$ScriptNo": "1111111",
       "$InOrder": false,
       "$AddedToOrderBy": "",
       "$ManuallyAdded": 0,
       "$InOrderId": "",
       "$ScriptStatus": "Refill",
       "$ScriptSource": "Prescription",
       "$RxChanged": "2020-03-16 16:43:41.940",
       "$RxWritten": "2020-01-15",
       "$RxExpires": "2021-01-14",
       "$Autofill": {
        "rx": 1,
        "patient": 1
       },
       "$Scripts": {
        "ordered": "",
        "high_refills": "1111111",
        "with_refills": "1111111",
        "oldest": "1111111",
        "newest": "1111111"
       },
       "$v2": "Apixaban 5mg",
       "$TotalQty": 4972,
       "$RepackQty": 180,
       "$MonthlyPrice": 20,
       "$NoTransfer": 4,
       "$IsPended": false,
       "$Status": "NOACTION_WILL_TRANSFER"
      },
      {
       "$Name": "* FINASTERIDE 5MG TAB",
       "$Msg": "is not due for a refill until 2020-05-03",
       "$Days": 0,
       "$Qty": 0,
       "$Refills": 4,
       "$Price": 0,
       "$FirstRefill": "2019-05-22",
       "$LastRefill": "2020-03-04",
       "$NextRefill": "2020-05-03",
       "$DaysSinceRefill": 29,
       "$DaysToRefill": 30,
       "$Stock": "HIGH SUPPLY",
       "$RefillsOrig": 4,
       "$RefillsLeft": 4,
       "$RefillsTotal": 4,
       "$AutofillDate": "",
       "$RefillDate": "2020-05-03",
       "$IsRefill": 5,
       "$IsDispensed": "",
       "$DaysSupply": 60,
       "$DispenseQty": 60,
       "$WrittenQty": 90,
       "$RemainingQty": 360,
       "$OriginalQty": 360,
       "$ProviderName": "Michael XXX",
       "$ProviderPhone": "7709252010",
       "$Npi": "1111111",
       "$Gcn": "41440",
       "$Sig": "Take 1 tablet by mouth once daily",
       "$OrderId": "31429",
       "$ScriptNo": "1111111",
       "$InOrder": false,
       "$AddedToOrderBy": "",
       "$ManuallyAdded": 0,
       "$InOrderId": "",
       "$ScriptStatus": "Refill",
       "$ScriptSource": "Prescription",
       "$RxChanged": "2019-12-05 11:51:07.760",
       "$RxWritten": "2019-07-02",
       "$RxExpires": "2020-07-01",
       "$Autofill": {
        "rx": 1,
        "patient": 1
       },
       "$Scripts": {
        "ordered": "",
        "high_refills": "1111111",
        "with_refills": "1111111",
        "oldest": "1111111",
        "newest": "1111111"
       },
       "$v2": "Finasteride 5mg",
       "$TotalQty": 5637.3,
       "$RepackQty": 135,
       "$MonthlyPrice": 2,
       "$NoTransfer": 5,
       "$IsPended": false,
       "$Status": "NOACTION_WILL_TRANSFER_CHECK_BACK"
      },
      {
       "$Name": "* LISINOPRIL 20MG TAB",
       "$Msg": "is out of refills, contact your doctor",
       "$Days": 0,
       "$Qty": 0,
       "$Refills": 0,
       "$Price": 0,
       "$FirstRefill": "2019-09-09",
       "$LastRefill": "2020-03-16",
       "$NextRefill": "2020-06-14",
       "$DaysSinceRefill": 17,
       "$DaysToRefill": 72,
       "$Stock": "HIGH SUPPLY",
       "$RefillsOrig": 2,
       "$RefillsLeft": 0,
       "$RefillsTotal": 0,
       "$AutofillDate": "",
       "$RefillDate": "2020-06-14",
       "$IsRefill": 2,
       "$IsDispensed": "",
       "$DaysSupply": 90,
       "$DispenseQty": 90,
       "$WrittenQty": 90,
       "$RemainingQty": 0,
       "$OriginalQty": 180,
       "$ProviderName": "Michael XXX",
       "$ProviderPhone": "1111111",
       "$Npi": "1111111",
       "$Gcn": "391",
       "$Sig": "Take 1 tablet by mouth once daily",
       "$OrderId": "31429",
       "$ScriptNo": "1111111",
       "$InOrder": false,
       "$AddedToOrderBy": "",
       "$ManuallyAdded": 0,
       "$InOrderId": "",
       "$ScriptStatus": "Refill",
       "$ScriptSource": "Prescription",
       "$RxChanged": "2019-12-05 11:49:21.143",
       "$RxWritten": "2020-01-15",
       "$RxExpires": "2021-01-14",
       "$Autofill": {
        "rx": 1,
        "patient": 1
       },
       "$Scripts": {
        "ordered": "",
        "high_refills": "",
        "with_refills": "",
        "oldest": "1111111",
        "newest": "1111111"
       },
       "$v2": "Lisinopril 20mg",
       "$TotalQty": 10190.7,
       "$RepackQty": 135,
       "$MonthlyPrice": 2,
       "$NoTransfer": 2,
       "$IsPended": false,
       "$Status": "ACTION_NO_REFILLS"
      },
      {
       "$Name": "* TAMSULOSIN 0.4MG CAP",
       "$Msg": "is out of refills, contact your doctor",
       "$Days": 0,
       "$Qty": 0,
       "$Refills": 0,
       "$Price": 0,
       "$FirstRefill": "2019-06-28",
       "$LastRefill": "2019-06-28",
       "$NextRefill": "2019-09-26",
       "$DaysSinceRefill": 279,
       "$DaysToRefill": -190,
       "$Stock": "HIGH SUPPLY",
       "$RefillsOrig": 1,
       "$RefillsLeft": 0,
       "$RefillsTotal": 0,
       "$AutofillDate": "",
       "$RefillDate": "2019-09-26",
       "$IsRefill": 5,
       "$IsDispensed": "",
       "$DaysSupply": 90,
       "$DispenseQty": 90,
       "$WrittenQty": 90,
       "$RemainingQty": 0,
       "$OriginalQty": 90,
       "$ProviderName": "Michael XXX",
       "$ProviderPhone": "1111111",
       "$Npi": "1111111",
       "$Gcn": "27546",
       "$Sig": "Take 1 capsule by mouth once daily",
       "$OrderId": "31429",
       "$ScriptNo": "1111111",
       "$InOrder": false,
       "$AddedToOrderBy": "",
       "$ManuallyAdded": 0,
       "$InOrderId": "",
       "$ScriptStatus": "Refill",
       "$ScriptSource": "Phone",
       "$RxChanged": "2019-06-28 13:29:30.080",
       "$RxWritten": "2019-06-27",
       "$RxExpires": "2020-06-26",
       "$Autofill": {
        "rx": 1,
        "patient": 1
       },
       "$Scripts": {
        "ordered": "",
        "high_refills": "",
        "with_refills": "",
        "oldest": "6013934",
        "newest": "6013934"
       },
       "$v2": "Tamsulosin 0.4mg",
       "$TotalQty": 9335.3,
       "$RepackQty": 135,
       "$MonthlyPrice": 2,
       "$NoTransfer": 5,
       "$IsPended": false,
       "$Status": "ACTION_NO_REFILLS"
      }
     ],
     "$Coupon": "",
     "$Card": "",
     "$Pharmacy": {
      "short": "WALMART",
      "name": "WALMART PHARMACY",
      "npi": "1111111",
      "fax": "",
      "phone": "1111111",
      "street": "XXXXX"
     },
     "$PatientAdded": "2018-01-16T18:06:25.000Z",
     "$OrderDispensed": "",
     "$OrderShipped": "",
     "$OrderAdded": "2020-04-02T18:35:54.000Z",
     "$OrderChanged": "2020-04-02T18:36:12.000Z",
     "$Tracking": "",
     "$Patient": {
      "first": "Test",
      "last": "User",
      "birth_date": "1985-03-10",
      "email": "test_user@goodpill.org",
      "phone1": "1111111",
      "phone2": "",
      "guardian_id": "2043",
      "address_1": "XXXX",
      "address_2": "",
      "city": "Atlanta",
      "state": "GA",
      "zip": "30093",
      "statusCode": "1001",
      "source": "Phone",
      "sourceCode": "",
      "syncDates": {
       "inOrder": 1,
       "2020-06-15": 2,
       "2020-05-01": 1,
       "2020-04-29": 1
      },
      "syncDate": [
       "2020-06-15",
       2,
       "reset"
      ],
      "medsync": true
     },
     "$RowChanged": "2020-04-02T18:42:33.645Z",
     "$Status": "=HYPERLINK(\"https://drive.google.com/drive/search?q=Shopping List 31429\", IF(NOW() - $OrderChanged > 11,  IF(NOW() - $OrderChanged > 14, \"Not Filling\", \"Delayed\"), \"Shopping 04-02\"))",
     "$Total": 6,
     "$Fee": 6,
     "$Due": 6,
     "$RowAdded": "2020-04-02T18:42:33.645Z"
    })
}
