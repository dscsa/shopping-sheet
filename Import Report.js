//Returns array of row arrays (with non data rows)
//Utilities.parseCsv() was causing more problems then it was helping so we roll our own CSV parser
function importCSV(filename){

  var files = DriveApp.getFilesByName(filename)

  if (files.hasNext()) {
    var file = files.next().getBlob().getDataAsString()

    //https://stackoverflow.com/questions/632475/regex-to-pick-commas-outside-of-quotes
    return file.split(/\r\n/g).map(function(row) {
      //Replace escaped double quotes because we had one instance of JSON being put into a user_defined field which because of JSON's quotes and commas broke our CSV
      //Replace NULL with empty double quotes
      var match = row.replace(/\\"/g, "'").replace(/NULL/g, '').split(/,(?=(?:[^"]|"[^"]*")*$)/g)
      //Log(JSON.stringify(match, null, " "))
      return match
    })
  }
}

//Returns array of row objects (only data rows)
//CSV[1] is headers.  First and last 3 rows do not have data.
function importReport(filename, sheet) {
   var csv = importCSV(filename)
   //Log('importCSV', csv.length, csv)
   if (csv.length < 6) //An empty report is 6 rows long
     throw Error('CSV file incomplete: '+JSON.stringify(csv, null, " "))

   csv = csv.slice(3, -3).map(function(vals) {
     //Log('toObject', csv[1], vals)
     return toObject(csv[1], vals)
   })

   return csv
}

function getReport(filename, sheet) {
  var report = importReport(filename, sheet)
  setImportTimestamp(sheet, report)
  normalizeDrugs(report)
  return groupByOrder(report)
}

//https://stackoverflow.com/questions/35810639/new-date-gives-invalid-date-in-app-script-but-works-fine-on-console
//do not put in 'Z' or it will mess up timezones
function toDate(date) {

  if ( ! date || date.length != 23) //YYYY-MM-DD HH:MM:SS.MMM
    return date

  return new Date(date.replace(' ', 'T').slice(0, -4))
}

function normalizeDrugs(report) {

  //var sheet = getSheet('GCN', 'A', 1)

  //var v2Names = sheet.colByKey('v2 Name')

  for (var i in report) {
    normalizeDrug(report[i])
    //addV2Name(report[i].drug, v2Names)
  }
}

function normalizeDrug(row) {

  var dispenseDate = +row.is_refill ? row.dispense_date : row.orig_disp_date //See Order 10062.  Seems that orig_disp_date may get set before dispense date causing a mismatch.  Correct for that here.

  //Changed threshold from 4 days to 2 days because of order 11265, which showed as dispensing with the same meds that we had shipped out
  var $IsDispensed = row.ship_date ? !!row.in_order : row.in_order && (new Date() - new Date(dispenseDate) < 2*24*60*60*1000)  //See Order #8590.  Risperidone 2mg was dispensed but it didn't register here and so because it was out of refills was excluded from the order //Order 10862 was shipped within 4 days of 10698, so showed Levothroxine and Metoprolol as dispensed even though they were in order 10698 and not 10862
  var $InOrder = $IsDispensed || (row.in_order && +row.refills_total)   //Even if its "in the order" it could be a pending or denied surescript refill request (order 7236) so need to make sure refills are available
  var $InOrderNotDispensed = row.in_order && ! $IsDispensed
  var $RefillsLeft = +($InOrderNotDispensed ? +row.refills_left : +row.refills_total).toFixed(2) //if not in order or already shipped use total refills not just the last dispensed to avoid erroneous out of refills warning

  row.drug = {
    $Name:($InOrder ? '' : '* ')+row.drug_name.slice(1, -1).trim(), //remove quotes that protect commas,
    $Msg:undefined,    //placeholder for JSON ordering.
    $Days:null,        //placeholder for JSON ordering.
    $Qty:null,         //placeholder for JSON ordering.
    $Refills:null,     //placeholder for JSON ordering.
    $Price:null,       //placeholder for JSON ordering.
    $SyncBy:undefined, //placeholder for JSON ordering.
    $Stock:undefined,  //placeholder for JSON ordering.
    $RefillsLeft:$RefillsLeft, //if not in order or already shipped use total refills not just the last dispensed to avoid erroneous out of refills warning
    $RefillsTotal:+(+row.refills_total).toFixed(2),
    $IsRefill:+row.is_refill,
    $IsDispensed:$IsDispensed,
    $FirstRefill:row.orig_disp_date,
    $LastRefill:dispenseDate,
    $NextRefill:'N/A',
    $DaysSupply:+row.days_supply,
    $DispenseQty:+row.dispense_qty,
    $WrittenQty:+row.written_qty,
    $Gcn:row.gcn_seqno,
    $Sig:row.sig_text.slice(1, -1).trim(),
    $OrderId:row.invoice_nbr,
    $ScriptNo:row.script_no,
    $InOrder:$InOrder, //if current_refills_left is not null then it currently is in the order
    $AddedToOrderBy:row.added_to_order_by,
    $InOrderId:row.in_order,
    $ScriptStatus:row.script_status,
    $ScriptSource:row.rx_source,
    $AutoPopulated:row.script_status == "SureScripts" && (row.rx_changed.slice(0, 10) >= row.order_added.slice(0, 10)), //If Rx was created on same day as order or after, then its likely a SureScript autopopulation.  Otherwise Cindy/AutoRefill added an existing Rx to an order
    $RxChanged:row.rx_changed,
    $RxExpires:toDate(row.expire_date),
    $Autofill:{rx:+row.rx_autofill, patient:+row.pat_autofill},
    $Scripts:{
      ordered:row.ordered_script_no,
      high_refills:row.oldest_script_high_refills,
      with_refills:row.oldest_script_with_refills,
      newest:row.newest_script
    }
  }

  if (row.script_status == 'Transferred Out') { //Or expired?
    row.drug.$Msg = 'Transferred Out'
    row.drug.$NextRefill = 'Transferred Out'
  }
  else if ( ! row.drug.$RefillsTotal) {
    row.drug.$NextRefill = 'No Refills'
    if ($InOrderNotDispensed) row.drug.$Msg = ' is in order but has no refills' //Could be a pending or denied surescript refill request (order 7236) so need to make sure refills are available
  }
  /*
  HOPEFULLY FIXED WITH THE var dispenseDate change above
  else if ( ! row.drug.$RefillsLeft) {
    row.drug.$LastRefill = new Date().toJSON().slice(0, 10) //Refills are deducted before $LastRefill date is updated.  Making it look like a drug with out any refills is in order.    //estimateNextRefill(drug)
    //This can happen if last refill was just dispensed AND if Cindy adds a 0 refills rx in order to request a sure script
    //sendEmail('adam.kircher@gmail.com', 'Last Refill Just Dispensed?', [JSON.stringify(row, null, '  ')])
  }
  */
  else if (row.drug.$RxExpires - toDate(row.order_added) < 0) {
    row.drug.$Refills = row.drug.$NextRefill = 'Rx Expired'
    row.drug.$Msg = 'has expired, ask your doctor for a new Rx'
  }
  else if (row.autofill_date) {  //We will fill even if autofill is off when this is set
    row.drug.$NextRefill = row.autofill_date.slice(0, 10)
    row.drug.$DaysUntilRefill = new Date(row.drug.$NextRefill) - toDate(row.order_added)
    if (row.drug.$DaysUntilRefill > minMedSyncTime(row.drug) && row.drug.$DaysUntilRefill < maxMedSyncTime(row.drug)) {

      var verb = row.drug.$InOrder ? ' will be' : ' may be'

      row.drug.$SyncBy = 0 //show that this med was medsynced
      row.drug.$Msg  = 'due on '+row.drug.$NextRefill+verb+' Med Synced to this Order *'
    }
  }
  else if (row.user_def_1.slice(1, -1) && ( ! +row.rx_autofill || ! +row.pat_autofill)) { //Has registered (backup pharmacy) but autofill was turned off (Note: autofill is off until a patient registers)
    row.drug.$NextRefill = 'AutoRefill Off'

    if ($InOrder) row.drug.$Msg = row.drug.$AutoPopulated ? 'has autorefill off but was just requested to be filled' : 'has autorefill off but was requested by you'  //Someone called in to request a med off autofill or a doctor sent one in (not sure if we should send the latter but better safe than sorry???).  Keeping second option ambiguous right now: to add "requessted by your doctor" we would need to check date_written.  Checking FirstRefill is giving us some false postives (e.g "requested by your doctor" but should be "by you")
  }
  else if (row.refill_date.slice(0,10) >= toDate(row.order_added).toJSON().slice(0, 10)) { //else if (row.drug.$LastRefill) estimateNextRefill(drug)
    row.drug.$NextRefill = row.refill_date.slice(0,10)
    row.drug.$DaysUntilRefill = new Date(row.drug.$NextRefill) - toDate(row.order_added)
    if (row.drug.$DaysUntilRefill > minMedSyncTime(row.drug) && row.drug.$DaysUntilRefill < maxMedSyncTime(row.drug)) {

      var verb = row.drug.$InOrder ? ' will be' : ' may be'

      row.drug.$SyncBy = 0 //show that this med was medsynced
      row.drug.$Msg = 'due on '+row.drug.$NextRefill+verb+' Med Synced to this Order *'
    }
  }
  else if (row.drug.$RxExpires - toDate(row.order_added) <= Math.max(45, row.drug.$DaysSupply)*24*60*60*1000) { //This needs to be after AutoFill Off because of #10662
    row.drug.$Refills = row.drug.$NextRefill = 'Rx Expiring'
    row.drug.$Msg = 'will expire soon, ask your doctor for a new Rx'
  }

  if (row.invoice_nbr == '11350' || row.invoice_nbr == '11349') {
    //debugEmail('WHAT IS GOING ON', '#'+row.invoice_nbr, row.drug.$Autofill, {rx:row.rx_autofill, patient:row.pat_autofill}, row)
  }
}

/*
function estimateNextRefill(drug) {
   var nextRefill = new Date(drug.$LastRefill)
   nextRefill.setDate(nextRefill.getDate()+drug.$DaysSupply)
   drug.$NextRefill = nextRefill.toJSON().slice(0, 10)
}
*/

/*
function addV2Name(drug, v2Names) {

  if ( ! v2Names[drug.$Gcn])
    drug.$Stock = 'Update GCN'

  drug.$v2 = v2Names[drug.$Gcn] || '' //use empty string so string.replace doesn't cause issues later on in the code
}*/

function groupByOrder(report) {
  //Log('report', report.length, report.reverse())

  var group = {}
  //Log('Log A', report)
  //since we are prepending go backwards to maintain order
  for (var i in report.reverse()) {

    if (Object.keys(report[i]).length < 4) continue

    if ( ! report[i].invoice_nbr) continue //Now that we include Transfer Outs.  Some patients may not have any Order Id (only one drug and it was never filled), skip these for now, because this currently causes shopping sheet to go crazy and keep adding blank rows

    if (report[i].script_status == 'Inactive') continue //skip inactive Rxs for right now

    var orderID = report[i].invoice_nbr

    //Log('groupByOrder', report[i].invoice_nbr, group[orderID])

    if ( ! group[orderID]) {
      group[orderID] = newGroup(report[i])
      //Log('groupByOrder', report[i].invoice_nbr, group[orderID])
    }

    //Logger.log(['Log B', group[orderID]])
    if (report[i].drug.$ScriptNo) //some lines are empty orders with no drugs
      group[orderID].$Drugs.push(report[i].drug)
    //addDrugtoOrder(group[orderID], report[i].drug)
  }

  return group
}

//If not in order, don't show if there is a similar drug (even different strengths) already in the order
//For this to work drugs need to be sorted with not included drugs being last, which is not in the report
/*function addDrugtoOrder(group, drug) {

  if ( ! drug.$Gcn) {
    drug.$Stock = 'No GCN'
    if (drug.$ScriptNo) debugEmail('No Gcn Error', drug)
    return //Missing Rx Orders
  }

  if ( ! drug.$InOrder) {
    var needle = drug.$v2.replace(/ [\d.]+/, '')
    for (var i in group.$Drugs) {
      if (needle == group.$Drugs[i].$v2.replace(/ [\d.]+/, '')) return
    }
  }

  //if (group.$OrderId == 4367) debugEmail('addDrugtoOrder', drug.$v2, needle, group.$Drugs)
  group.$Drugs.push(drug)
}*/

function newGroup(row) {
  var pharmacyInfo = row.user_def_2.slice(1, -1).split(',')
  var paymentInfo  = row.user_def_4.slice(1, -1).split(',')
  var rxSource     = row.order_category == 3 ? 'Transfer' : 'eRX'
  var pharmacyName = row.user_def_1.slice(1, -1).replace(/ #|-\d|\d-|\d/g, '').replace(/\s{2,}/g, ' ')  //Remove digits, pound sign, and hyphens (Store Number) from pharmacy name

  var now = new Date()
  //if (now.getHours() == 17 && now.getMinutes() < 3 && (row.tracking_code || row.ship_date))
  //  sendEmail('adam.kircher@gmail.com', 'Order to be shipped', ['order #', row.invoice_nbr, 'tracking_code', row.tracking_code, 'ship_date', row.ship_date, 'row', JSON.stringify(row, null, '  ')])

  return {
    $OrderId:row.invoice_nbr,
    $Drugs:[],
    $New:+row.is_current_patient ? undefined : rxSource, //2 is eRx, 3 is pharmacy, NULL is SureScript or Cindy Manually Entered //Delete later if not new
    $Coupon:paymentInfo[3],
    $Card:paymentInfo[2] && paymentInfo[0] ? paymentInfo[2]+' '+paymentInfo[0] : '',
    $Lang:row.primary_language_cd,
    $Pharmacy:pharmacyName ? pharmacyName+' on '+pharmacyInfo[3]+' ('+pharmacyInfo[2]+')' : '',
    $PatientAdded:toDate(row.patient_added),
    $OrderDispensed:row.ship_date ? toDate(row.ship_date) : '',
    $OrderAdded:toDate(row.order_added),
    $OrderChanged:toDate(row.order_changed),
    $Tracking:row.tracking_code && row.tracking_code != 'NULL' ? row.tracking_code : '' ,
    $Patient:{
       first:row.fname,
       last:row.lname,
       birth_date:toDate(row.birth_date),
       email:row.email,
       phone1:row.home_phone,
       phone2:row.home_phone != row.cell_phone && row.cell_phone,
       guardian_id:row.pat_id,
       address_1:row.address_1.slice(1, -1),
       address_2:row.address_2.slice(1, -1),
       city:row.city,
       state:row.state,
       zip:row.zip,
       source:rxSource
     }
   }
}

function testDate() {
  Log((new Date() - new Date('2018-03-24'))/1000/60/60/24)
}

function setImportTimestamp(sheet, csv) {
  //Update sheet with the datetime at which report was run
  //Wait until most calculation complete it doesn't look like it was updated successfully if some error actually halted the script
  //If empty report there will be no get date, so put in empty string.  Or should we leave the last date the report had orders?
  var now            = new Date()
  var lastRunAt      = toDate(csv[0].get_date)
  var hoursAgo       = (now - lastRunAt)/1000/60/60
  var emailOnTheHour = (hoursAgo % 1).toFixed(2) //we don't want an email on every trigger (5mins before hour currently)
  if (hoursAgo > 3/60 && emailOnTheHour > .92) { //.92 * 60 = 55mins.  So should trigger at 57mins on current schedule
    sendEmail('hello@goodpill.org', 'Please restart Google Drive Sync', ['Please restart Google Drive Sync. Shopping Report last updated '+hoursAgo+' hours ago on '+lastRunAt])
  } else {
    sheet.getRange('B1').setValue(csv[0].get_date)
    if (now.getHours() == 16 && now.getMinutes() < 3)
      sendEmail('adam.kircher@gmail.com', 'csv', [JSON.stringify(csv, null, '  ')])
  }
}
