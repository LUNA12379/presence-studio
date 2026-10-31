// Listing screenshots use synthetic, non-personal activity data in the isolated verifier.
// This is a presentation fixture, not evidence of a live browser/Discord connection.
(async () => {
  const before=latest,wasStopping=stopping;
  stopping=true;clearTimeout(timerNotice);$('toast').hidden=true;
  const wait=async()=>{for(let i=0;i<60;i++){if(!window.studioListingCapture)return;await new Promise(r=>setTimeout(r,100));}throw Error('Listing capture timed out');};
  try {
    for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    for(const language of ['en','ko']) {
      const client={id:'11111111-1111-4111-8111-111111111111',browser:'chrome',version:latest.extension.requiredVersion,state:'current',connection:'paired'};
      const session={sessionId:client.id+':7',tabId:7,browser:'chrome',title:'Evening loops',channel:'Presence Studio · Demo track',source:'soundcloud',paused:false};
      const data={...before,config:{...before.config,language,enabled:true,sourceMode:'auto',pinnedSessionId:null},store:{published:false,state:'pending'},update:{...before.update,phase:'idle',currentVersion:before.version,progress:0,notes:''},extension:{requiredVersion:client.version,clients:[client],needsAttention:false},extensionConnected:true,desktopConnected:true,connected:true,published:true,sessions:[session],current:session,display:{title:session.title,subtitle:session.channel,source:'soundcloud',type:2,image:'',position:84,duration:214,updatedAt:Date.now(),rate:1,paused:false,timer:'media'}};
      render(data);panel('home');window.scrollTo(0,0);
      window.studioListingCapture='listing-activity-'+language;await wait();
    }
    window.studioListingVerification={done:true};
  }catch(error){window.studioListingVerification={done:true,error:error.message};}
  finally{render(before);stopping=wasStopping;}
})();
