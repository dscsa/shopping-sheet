function debugEmail() {
  var subject = 'v4 Debug '+getCaller()+getEmailQuota()
  var body = '<pre>'+argArray(arguments).join('\n\n')+'</pre>'
  sendEmail(subject, body.split('\n'))
}

function infoEmail() {
  var subject = 'v4 Info '+getCaller()+getEmailQuota()
  var body = '<pre>'+argArray(arguments).join('\n\n')+'</pre>'
  sendEmail(subject, body.split('\n'))
}

function Log() {
  console.log.apply(console, arguments)
  Logger.log(argArray(arguments, ['Log', getCaller()]).join(' '))
}

function argArray(args, prepend) {
  prepend = prepend || []
  for (var i in args) {

    if (args[i] instanceof Error)
      args[i] = '\nError: "'+args[i].message+'"'+(args[i].stack ? ' '+args[i].stack.trim().split('\n') : '')+'\n\n' //only stack if Error is thrown

    if (args[i] && typeof args[i] == 'object') {
      args[i] = '<pre>'+JSON.stringify(args[i], null, ' ')+'</pre>'
    }

    prepend.push(args[i])
  }
  return prepend
}

function getCaller() {
  try { //weirdly new Error().stack is null, must throw
    throw new Error()
  } catch (err) {
    return err.stack.split('\n')[2].trim()
  }
}

function getEmailQuota() {
  return " "+(1501 - MailApp.getRemainingDailyQuota())+" of 1500"
}

var overQuota = 0
function sendEmail(to, subject, body, attachments) {


  Log('sendEmail', to, subject, body)

  if (overQuota > 1) return Log('Skipping email since likely over quota and email failures are time-consuming')

  var  cc = ''
  var bcc = ''

  if ( ! to) {
    bcc = 'adam@sirum.org'
  }
  if ( ~ to.indexOf('@')) {

    var prevMessage = mainCache.get(to) || ''
    var msgHistory  = prevMessage+'<br>'+scriptId.toJSON()+': '+subject+'<br>'+body

    var wasShipped  = ~ prevMessage.indexOf('items has shipped')
    var  isShipped  = ~ msgHistory.indexOf('items has shipped')

    //Override cache if this email is a shipped email and the previous email was not
    var noCacheIfShipped  = wasShipped ? true : ! isShipped
    var noCacheIfInternal = ! ~ to.indexOf('@sirum.org') && ! ~ to.indexOf('@goodpill.org')

    mainCache.put(to, msgHistory, 4*60*60)

    if (prevMessage && noCacheIfShipped && noCacheIfInternal)
      return debugEmail('Stop email spam', msgHistory)

    if ( ! LIVE_MODE) to = ''
    bcc = 'adam@sirum.org'
  }
  else {
    attachments = body
    body    = subject
    subject = to
    to      = 'adam@sirum.org'
  }

  try {
    MailApp.sendEmail({
      name:'Good Pill Pharmacy',
      to:to,
      cc:cc,
      bcc:bcc,
      subject:subject,
      htmlBody:body.join('<br>'),
      attachments:attachments
    })
  } catch (e) {
    //TODO confirm this by checking if error matches "Email quota likely reached Exception: Service invoked too many times for one day: email."  "
    Log('Email Not Sent: Quota likely reached', e.message, e.stack, e)
    overQuota++
  }
}
