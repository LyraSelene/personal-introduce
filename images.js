/* One small raster attachment, stored under the same RLS as its parent. */
(() => {
  'use strict';
  const limit=700000;
  const valid=value=>typeof value==='string'&&value.length<=limit&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
  function render(value,alt='配图',className='attached-image') {
    if(!valid(value))return null;
    const img=document.createElement('img');img.className=className;img.src=value;img.alt=alt;img.loading='lazy';img.decoding='async';return img;
  }
  async function compress(file) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片。');
    if(file.size>8*1024*1024)throw Error('原图不能超过 8 MB。');
    const url=URL.createObjectURL(file);
    try {
      const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('图片读取失败，请换一张图片。'));image.src=url;});
      if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('图片尺寸过大或无效，请缩小后再试。');
      let side=1400;
      for(let attempt=0;attempt<4;attempt++,side=Math.floor(side*.75)) {
        const scale=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器暂不支持图片处理。');ctx.drawImage(img,0,0,canvas.width,canvas.height);
        for(const quality of [.82,.68,.54]) {
          let data=canvas.toDataURL('image/webp',quality);
          if(!data.startsWith('data:image/webp;')){ctx.fillStyle='#fffdf4';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',quality);}
          if(valid(data))return data;
        }
      }
      throw Error('图片压缩后仍过大，请换一张图片。');
    } finally {URL.revokeObjectURL(url);}
  }
  function picker(parent,initial=null,onChange=()=>{}) {
    let value=valid(initial)?initial:null,revision=0,pending=false,failed=false;
    const wrap=document.createElement('fieldset');wrap.className='image-picker';
    const label=document.createElement('legend');label.textContent='配一张图片（可选）';
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label','选择配图');
    const note=document.createElement('p');note.className='system-note';note.textContent='JPG / PNG / WebP，原图不超过 8 MB。自动压缩为静态图片；仍需填写正文。';
    const preview=document.createElement('div');preview.className='image-picker-preview';
    const remove=document.createElement('button');remove.type='button';remove.className='system-button';remove.textContent='移除图片';
    const status=document.createElement('p');status.className='system-status';status.setAttribute('role','status');
    function paint(){preview.replaceChildren();const image=render(value,'所选图片预览');if(image)preview.append(image);remove.hidden=!value&&!failed&&!pending;}
    function set(next){revision++;pending=false;failed=false;value=valid(next)?next:null;input.value='';status.textContent='';paint();}
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;
      const current=++revision;pending=true;failed=false;status.textContent='正在压缩图片，请稍候…';paint();
      try{const data=await compress(file);if(current!==revision||!wrap.isConnected)return;value=data;failed=false;status.textContent='配图已准备好，保存或寄出时才会上传。';}
      catch(e){if(current!==revision||!wrap.isConnected)return;failed=true;status.textContent=`${e.message} 请重新选择，或移除图片后继续。`;}
      finally{if(current===revision&&wrap.isConnected){pending=false;input.value='';paint();onChange();}}
    });
    remove.addEventListener('click',()=>{set(null);onChange();});
    wrap.append(label,input,note,preview,remove,status);parent.append(wrap);paint();
    return {get value(){return value;},get pending(){return pending;},assertReady(){if(pending)throw Error('图片仍在处理中，请稍候再保存。');if(failed)throw Error('图片处理失败，请重新选择或移除后继续。');},set,dispose(){revision++;pending=false;}};
  }
  window.LimeImages=Object.freeze({valid,render,picker,compress});
})();
