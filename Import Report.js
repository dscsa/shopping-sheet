//Returns array of row arrays (with non data rows)
//Utilities.parseCsv() was causing more problems then it was helping so we roll our own CSV parser
function importCSV(filename){

  var files = DriveApp.getFilesByName(filename)

  if (files.hasNext()) {
    var file = files.next()

    var now = new Date()
    if (now.getHours() == 18 && now.getMinutes() < 6)
      sendEmail('adam@sirum.org', 'import report csv', 'import report csv is attached', file.getAs(MimeType.CSV))

    file = file.getBlob().getDataAsString()

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
function importReport(filename) {
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
  var report = importReport(filename)
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

  var dispenseDate = +row.is_refill ? row.last_dispense_date : row.orig_disp_date //See Order 10062.  Seems that orig_disp_date may get set before dispense date causing a mismatch.  Correct for that here.
  var $NextRefill  = row.autofill_date ? row.autofill_date : row.refill_date


  var daysSinceRefill = Math.floor((toDate(row.order_added) - new Date(dispenseDate))/1000/60/60/24) || ''
  var daysToRefill    = $NextRefill ? Math.floor((toDate($NextRefill) - toDate(row.order_added))/1000/60/60/24) : ''
  //Changed threshold from 4 days to 2 days because of order 11265, which showed as dispensing with the same meds that we had shipped out
  //See Order #8590.  Risperidone 2mg was dispensed but it didn't register here and so because it was out of refills was excluded from the order //Order 10862 was shipped within 4 days of 10698, so showed Levothroxine and Metoprolol as dispensed even though they were in order 10698 and not 10862.  However for 11640 a 2 day difference caused it to not be on invoice sheet, so getting it to 3 days since 2 is too little and 4 is too much
  //See Order #15472 which came 2.7 days after #15227.  Should not have been marked as isDispensed but threshold was at 3 days since it was actually shipped already

  var $IsDispensed = row.dispense_date ? !!row.in_order : (row.in_order && daysSinceRefill && daysSinceRefill < 4) //&& daysToRefill >= 15 removed because of Order 17109
  var $InOrder     = $IsDispensed || (row.in_order && +row.refills_total)   //Even if its "in the order" it could be a pending or denied surescript refill request (order 7236) so need to make sure refills are available
  var $RefillsLeft = ($InOrder && ! $IsDispensed) ? +row.refills_left : +row.refills_total //if not in order or already shipped use total refills not just the last dispensed to avoid erroneous out of refills warning
  var isRegistered = row.user_def_1.slice(1, -1) //Use presence of backup pharmacy as proxy for registration

  row.drug = {
    $Name:($InOrder ? '' : '* ')+row.drug_name.slice(1, -1).trim(), //remove quotes that protect commas,
    $Msg:undefined,    //placeholder for JSON ordering.
    $Days:null,        //placeholder for JSON ordering.
    $Qty:null,         //placeholder for JSON ordering.
    $Refills:null,     //placeholder for JSON ordering.
    $Price:null,       //placeholder for JSON ordering.
    $FirstRefill:row.orig_disp_date,
    $LastRefill:dispenseDate,
    $NextRefill:$NextRefill.slice(0, 10),
    $DaysSinceRefill:daysSinceRefill,
    $DaysToRefill:daysToRefill,
    $Stock:undefined,  //placeholder for JSON ordering.
    $SyncBy:undefined, //placeholder for JSON ordering.
    $RefillsOrig:+(+row.refills_orig).toFixed(2),
    $RefillsLeft:+$RefillsLeft.toFixed(2), //if not in order or already shipped use total refills not just the last dispensed to avoid erroneous out of refills warning
    $RefillsTotal:+(+row.refills_total).toFixed(2),
    $AutofillDate:row.autofill_date && row.autofill_date.slice(0, 10),
    $RefillDate:row.refill_date && row.refill_date.slice(0,10),
    $IsRefill:+row.is_refill,
    $IsDispensed:$IsDispensed,
    $DaysSupply:+row.days_supply,
    $DispenseQty:+row.dispense_qty,
    $WrittenQty:+row.written_qty,
    $RemainingQty:row.written_qty * ( +$RefillsLeft || +row.refills_total), //Assume we will switch to a script with refills if one is available),
    $OriginalQty:row.written_qty * row.refills_orig,
    $ProviderName:row.provider_fname+' '+row.provider_lname,
    $ProviderPhone:row.provider_phone,
    $Npi:row.npi,
    $Gcn:row.gcn_seqno,
    $Sig:row.sig_text.slice(1, -1).trim(),
    $OrderId:row.invoice_nbr,
    $ScriptNo:row.script_no,
    $InOrder:!!$InOrder, //if current_refills_left is not null then it currently is in the order
    $AddedToOrderBy:row.added_to_order_by,
    $ManuallyAdded: ~ ['WEBFORM', 'MANUAL'].indexOf(row.added_to_order_by),
    $InOrderId:row.in_order,
    $ScriptStatus:row.script_status,
    $ScriptSource:row.rx_source,
    $RxChanged:row.rx_changed,
    $RxWritten:addHours( - 365*24, row.expire_date.slice(0,10)).toJSON().slice(0, 10),
    $RxExpires:row.expire_date.slice(0,10),
    $Autofill:{
      rx: isRegistered ? +row.rx_autofill : null,
      patient:isRegistered ? +row.pat_autofill : null
    },
    $Scripts:{
      ordered:row.ordered_script_no,
      high_refills:row.oldest_script_high_refills,
      with_refills:row.oldest_script_with_refills,
      oldest:row.oldest_active_script,
      newest:row.newest_script
    }
  }
}

function groupByOrder(report) {
  //Log('report', report.length, report.reverse())

  var group = {}
  //Log('Log A', report)
  //since we are prepending go backwards to maintain order
  for (var i in report.reverse()) {

    if (Object.keys(report[i]).length < 4) continue

    if ( ! report[i].invoice_nbr) continue //Now that we include Transfer Outs.  Some patients may not have any Order Id (only one drug and it was never filled), skip these for now, because this currently causes shopping sheet to go crazy and keep adding blank rows

    if (report[i].script_status == 'Inactive') continue //skip inactive Rxs for right now

    if (report[i].order_status == 209) continue //skip SureScript Authorization Denied: [CsOmStatus] for now

    var orderID = report[i].invoice_nbr

    //Log('groupByOrder', report[i].invoice_nbr, group[orderID])

    if ( ! group[orderID]) {
      group[orderID] = newGroup(report[i])
      //Log('groupByOrder', report[i].invoice_nbr, group[orderID])
    }

    //Logger.log(['Log B', group[orderID]])
    if (report[i].drug.$ScriptNo) { //some lines are empty orders with no drugs

      if (report[i].drug.$OrderId == orderID)
        group[orderID].$Drugs.push(report[i].drug)
      else {
        debugEmail('WHAT IS GOING ON!!! Drugs in wrong order', 'orderID', orderID, 'i', i, 'drug', report[i].drug, 'group', group, 'report', report)
        throw new Error('groupByOrder Drugs in wrong order')
      }
    }
    //addDrugtoOrder(group[orderID], report[i].drug)
  }

  return group
}

function newGroup(row) {

  //SELECT * FROM csct_code WHERE ct_id = 5007.  Not specified usually means Entered (Phone/Fax) or Surescripts
  var order_categories = ['Not Specified', 'Webform Complete', 'Webform eRx', 'Webform Transfer', 'Auto Refill', '0 Refills', 'Webform Refill', 'eRx /w Note', 'Transfer /w Note', 'Refill w/ Note']

  var pharmacyInfo = row.user_def_2.slice(1, -1).split(',')
  var paymentInfo  = row.user_def_4.slice(1, -1).split(',')
  var orderSource  = order_categories[row.order_category] || row.rx_source
  var pharmacyName = row.user_def_1.slice(1, -1)  //Remove digits, pound sign, and hyphens (Store Number) from pharmacy name

  var now = new Date()
  //if (now.getHours() == 17 && now.getMinutes() < 3 && (row.tracking_code || row.ship_date))
  //  sendEmail('adam.kircher@gmail.com', 'Order to be shipped', ['order #', row.invoice_nbr, 'tracking_code', row.tracking_code, 'ship_date', row.ship_date, 'row', JSON.stringify(row, null, '  ')])

  return {
    $OrderId:row.invoice_nbr,
    $Drugs:[],
    $New:+row.is_current_patient ? undefined : orderSource, //2 is eRx, 3 is pharmacy, NULL is SureScript or Cindy Manually Entered //Delete later if not new
    $Coupon:paymentInfo[3],
    $Card:paymentInfo[2] && paymentInfo[0] ? paymentInfo[2]+' '+paymentInfo[0] : '',
    $Lang:row.primary_language_cd,
    $Pharmacy:{
      short:pharmacyName ? pharmacyName.replace(/ #|-\d|\d-| ?\d| pharmacy/ig, '').replace(/\s{2,}/g, ' ')+' on '+pharmacyInfo[3]+' ('+pharmacyInfo[2]+')' : '',
      name:pharmacyName,
      npi:pharmacyInfo[0],
      fax:pharmacyInfo[1] || '', //Replace Fax Out Transfer Template with a blank string
      phone:pharmacyInfo[2] || '', //Replace Fax Out Transfer Template with a blank string
      street:pharmacyInfo[3]
    },
    $PatientAdded:toDate(row.patient_added),
    $OrderDispensed:row.dispense_date ? toDate(row.dispense_date) : '',
    $OrderShipped:row.ship_date ? toDate(row.ship_date) : '',
    $OrderAdded:toDate(row.order_added),
    $OrderChanged:toDate(row.order_changed),
    $Tracking:row.tracking_code && row.tracking_code != 'NULL' ? row.tracking_code : '' ,
    $Patient:{
       first:row.fname,
       last:row.lname,
       birth_date:row.birth_date.slice(0, 10),
       email:row.email,
       phone1:row.home_phone ? formatPhone(row.home_phone) :  '',
       phone2:row.home_phone != row.cell_phone && row.cell_phone ? formatPhone(row.cell_phone) :  '',
       guardian_id:row.pat_id,
       address_1:row.address_1.slice(1, -1),
       address_2:row.address_2.slice(1, -1),
       city:row.city,
       state:row.state,
       zip:row.zip,
       statusCode:row.order_status,
       source:orderSource,
       sourceCode:row.order_category
     }
   }
}

function formatPhone(phone) {
  return phone.slice(0, 3)+'-'+phone.slice(3,6)+'-'+phone.slice(6)
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
  }
}
