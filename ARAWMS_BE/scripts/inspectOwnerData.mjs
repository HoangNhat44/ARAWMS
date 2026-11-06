import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';
const uri=process.env.MONGODB_URI;
console.log(JSON.stringify({configured:Boolean(uri),scheme:uri?.split(':')[0]}));
if(uri?.startsWith('mongodb+srv:')){
 const host=new URL(uri).hostname;
 for(const server of ['1.1.1.1','8.8.8.8']){const resolver=new dns.promises.Resolver({timeout:2500,tries:1});resolver.setServers([server]);try { const records=await resolver.resolveSrv('_mongodb._tcp.'+host); console.log(JSON.stringify({dnsServer:server,srvRecords:records.length})); dns.setServers([server]);break;}catch(e){console.log(JSON.stringify({dnsServer:server,error:e.code}));}}
}
try {
 await mongoose.connect(uri,{serverSelectionTimeoutMS:10000,connectTimeoutMS:5000});
 for(const name of ['products','skus','supplier_contracts','material_inbound_plans','stocktake_sessions','raw_materials']){const c=mongoose.connection.collection(name);console.log(JSON.stringify({collection:name,count:await c.countDocuments({isDeleted:{$ne:true}}),summary:await c.aggregate([{$match:{isDeleted:{$ne:true}}},{$group:{_id:null,first:{$min:'$createdAt'},last:{$max:'$createdAt'},statuses:{$addToSet:'$status'}}}]).toArray()}));}
}catch(e){console.log(JSON.stringify({error:e.name,code:e.code,cause:e.cause?.code}));process.exitCode=1;}finally{await mongoose.disconnect();}
