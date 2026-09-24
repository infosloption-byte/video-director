import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./SceneCustomizePanel.css";

const FRAMEWORKS = [
  { key:"disruptor",label:"The Disruptor" },
  { key:"how-it-works",label:"How It Works" },
  { key:"skeptic",label:"The Skeptic" },
  { key:"countdown",label:"The Countdown" },
];
const TONES=["Energetic","Calm & authoritative","Conversational"];
const AUDIENCES=["General public","Enthusiast"];

function voiceKey(voice){ return voice ? voice.source + ":" + voice.id : ""; }
function sceneVoice(scene,setup,voices){
  const saved=scene.customization?.voice;
  if(saved?.id){
    return voices.find((voice)=>voice.source===saved.source&&voice.id===saved.id)||{
      source:saved.source,id:saved.id,name:saved.name||"Selected voice",engine:saved.engine||"",
      language:saved.language||"English",accent:"",gender:"",tone:"",
      description:saved.source==="clone"?"Your cloned voice":"Predefined voice"
    };
  }
  return voices.find((voice)=>voice.source===setup?.voice?.source&&voice.id===setup?.voice?.id)||null;
}

export default function SceneCustomizePanel({
  scene,customSetup,voices,onPreviewVoice,previewingVoice,previewLoading,onRewrite,onChangeVoice,onRegenerateVisuals,onClose,busy=""
}){
  const saved=scene.customization&&typeof scene.customization==="object"?scene.customization:{};
  const activeVoice=useMemo(()=>sceneVoice(scene,customSetup,voices),[scene,customSetup,voices]);
  const [framework,setFramework]=useState(saved.framework||customSetup?.framework||"how-it-works");
  const [tone,setTone]=useState(saved.tone||customSetup?.tone||"Conversational");
  const [audience,setAudience]=useState(saved.audienceLevel||customSetup?.audienceLevel||"General public");
  const [lengthMode,setLengthMode]=useState("keep");
  const [instruction,setInstruction]=useState("");
  const [visualQuery,setVisualQuery]=useState(scene.brollSearchTerm||"");
  const [voiceOpen,setVoiceOpen]=useState(false);
  const [voiceSearch,setVoiceSearch]=useState("");
  const voiceRef=useRef(null);

  useEffect(()=>{
    setFramework(saved.framework||customSetup?.framework||"how-it-works");
    setTone(saved.tone||customSetup?.tone||"Conversational");
    setAudience(saved.audienceLevel||customSetup?.audienceLevel||"General public");
    setVisualQuery(scene.brollSearchTerm||"");
  },[scene.id,scene.brollSearchTerm,saved.framework,saved.tone,saved.audienceLevel,customSetup?.framework,customSetup?.tone,customSetup?.audienceLevel]);

  useEffect(()=>{
    const close=(event)=>{if(!voiceRef.current?.contains(event.target))setVoiceOpen(false);};
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[]);

  const filteredVoices=useMemo(()=>{
    const q=voiceSearch.trim().toLowerCase();
    if(!q)return voices;
    return voices.filter((voice)=>[voice.name,voice.accent,voice.gender,voice.tone,voice.description,voice.language,voice.engine].filter(Boolean).join(" ").toLowerCase().includes(q));
  },[voices,voiceSearch]);

  const targetDuration=useMemo(()=>{
    const current=Number(scene.durationSeconds||5);
    if(lengthMode==="shorter")return Math.max(1.5,Math.min(30,current*.78));
    if(lengthMode==="longer")return Math.max(1.5,Math.min(30,current*1.22));
    return current;
  },[scene.durationSeconds,lengthMode]);

  const selectedVoiceKey=voiceKey(activeVoice);

  async function rewrite(refreshVisuals){
    const ok=await onRewrite?.({
      framework,tone,audienceLevel:audience,targetDurationSeconds:Number(targetDuration.toFixed(1)),
      instruction:instruction.trim(),refreshVisuals
    });
    if(ok){setInstruction("");setLengthMode("keep");}
  }
  async function applyVoice(voice){
    if(!voice||voiceKey(voice)===selectedVoiceKey)return;
    const ok=await onChangeVoice?.(voice);
    if(ok){setVoiceOpen(false);setVoiceSearch("");}
  }
  const projectFramework=FRAMEWORKS.find((item)=>item.key===(customSetup?.framework||"how-it-works"))?.label||"How It Works";
  const projectTone=customSetup?.tone || "Conversational";
  const projectAudience=customSetup?.audienceLevel || "General public";
  const projectVoice=customSetup?.voice?.name || "Project voice";

  useEffect(()=>{
    const onKeyDown=(event)=>{ if(event.key==="Escape") onClose?.(); };
    document.addEventListener("keydown",onKeyDown);
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{
      document.removeEventListener("keydown",onKeyDown);
      document.body.style.overflow=previousOverflow;
    };
  },[onClose]);

  const modal=(
    <div className="scene-customize-modal" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose?.();}}>
      <div className="scene-customize scene-customize--modal" role="dialog" aria-modal="true" aria-labelledby={"scene-customize-title-"+scene.id}>
        <div className="scene-customize__head">
          <div>
            <p className="mono-label">SCENE {String(scene.sceneOrder).padStart(2,"0")} · SCENE EDITOR</p>
            <h4 id={"scene-customize-title-"+scene.id}>Fine-tune this scene without changing the rest.</h4>
            <p>These controls override the project Setup only for this scene. The research foundation stays the same.</p>
          </div>
          <div className="scene-customize__head-actions">
            <span className="scene-customize__inherit">Scene-specific</span>
            <button type="button" className="scene-customize__close" onClick={()=>onClose?.()} aria-label="Close scene customization">×</button>
          </div>
        </div>

        <div className="scene-customize__context">
          <div><span className="mono-label">INHERITED SETUP</span><strong>{projectFramework}</strong></div>
          <div><span>Tone</span><strong>{projectTone}</strong></div>
          <div><span>Audience</span><strong>{projectAudience}</strong></div>
          <div><span>Voice</span><strong>{projectVoice}</strong></div>
        </div>

        <div className="scene-customize__current-copy">
          <span className="mono-label">CURRENT NARRATION</span>
          <p>{scene.spokenText || "No narration is available yet."}</p>
        </div>

        <div className="scene-customize__grid">
        <div className="scene-customize__column">
          <div className="scene-customize__section-title"><span className="scene-customize__index">01</span><div><strong>Rewrite narration</strong><span>Change the line while keeping it evidence-grounded.</span></div></div>

          <div className="scene-customize__field">
            <label htmlFor={"scene-instruction-" + scene.id}>What should change?</label>
            <textarea id={"scene-instruction-" + scene.id} value={instruction} onChange={(event)=>setInstruction(event.target.value)} placeholder="e.g. Make this punchier, simpler, or more concrete…" rows={3} disabled={Boolean(busy)} />
          </div>

          <div className="scene-customize__quick">
            <span>Quick directions</span>
            <div>
              {[
                ["Punchier","Make the narration punchier and faster without changing the facts."],
                ["Simpler","Explain this in simpler language for a general audience."],
                ["More concrete","Make the wording more concrete and specific to the mechanism in this scene."],
                ["Stronger hook","Open with a sharper curiosity hook while preserving the factual meaning."],
              ].map(([label,value])=><button type="button" key={label} onClick={()=>setInstruction(value)} disabled={Boolean(busy)}>{label}</button>)}
            </div>
          </div>

          <div className="scene-customize__controls">
            <div><label>Scene framework</label><div className="scene-customize__pills">{FRAMEWORKS.map((item)=><button type="button" key={item.key} className={framework===item.key?"is-selected":""} onClick={()=>setFramework(item.key)} disabled={Boolean(busy)}>{item.label}</button>)}</div></div>
            <div><label>Tone</label><div className="scene-customize__pills">{TONES.map((item)=><button type="button" key={item} className={tone===item?"is-selected":""} onClick={()=>setTone(item)} disabled={Boolean(busy)}>{item}</button>)}</div></div>
            <div><label>Audience</label><div className="scene-customize__pills">{AUDIENCES.map((item)=><button type="button" key={item} className={audience===item?"is-selected":""} onClick={()=>setAudience(item)} disabled={Boolean(busy)}>{item}</button>)}</div></div>
            <div><label>Line length</label><div className="scene-customize__pills">{[["keep","Keep"],["shorter","Tighter"],["longer","More room"]].map(([key,label])=><button type="button" key={key} className={lengthMode===key?"is-selected":""} onClick={()=>setLengthMode(key)} disabled={Boolean(busy)}>{label}</button>)}</div></div>
          </div>

          <div className="scene-customize__actions">
            <button type="button" className="scene-customize__secondary" onClick={()=>rewrite(false)} disabled={Boolean(busy)}>{busy==="rewrite"?"Rewriting…":"Rewrite narration only"}</button>
            <button type="button" className="scene-customize__primary" onClick={()=>rewrite(true)} disabled={Boolean(busy)}>{busy==="rewrite-visuals"?"Rewriting + refreshing…":"Rewrite + refresh visuals →"}</button>
          </div>
        </div>

        <div className="scene-customize__column scene-customize__column--visuals">
          <div className="scene-customize__section-title"><span className="scene-customize__index">02</span><div><strong>Scene voice & visuals</strong><span>Give this cut its own narrator and B-roll search.</span></div></div>

          <div className="scene-customize__field">
            <label>Scene narrator</label>
            <div className="scene-customize__voice-picker" ref={voiceRef}>
              <button type="button" className={"scene-customize__voice-trigger " + (voiceOpen?"is-open":"")} onClick={()=>setVoiceOpen((open)=>!open)} disabled={Boolean(busy)}>
                {activeVoice ? (
                  <span className="scene-customize__voice-selected">
                    <span className="scene-customize__voice-avatar">{String(activeVoice.name||"V").slice(0,2).toUpperCase()}</span>
                    <span><small>{activeVoice.source==="clone"?"YOUR CLONE":"PREDEFINED"}</small><strong>{activeVoice.name}</strong><em>{[activeVoice.accent,activeVoice.gender,activeVoice.tone,activeVoice.language].filter(Boolean).join(" · ")}</em></span>
                  </span>
                ) : <span className="scene-customize__voice-placeholder">Use project voice</span>}
                <b aria-hidden="true">⌄</b>
              </button>

              {voiceOpen && (
                <div className="scene-customize__voice-menu">
                  <div className="scene-customize__voice-search">
                    <span aria-hidden="true">⌕</span>
                    <input type="search" value={voiceSearch} onChange={(event)=>setVoiceSearch(event.target.value)} placeholder="Search name, accent, tone…" aria-label="Search scene voices" autoFocus />
                    {voiceSearch&&<button type="button" onClick={()=>setVoiceSearch("")} aria-label="Clear voice search">×</button>}
                  </div>
                  <div className="scene-customize__voice-list">
                    {filteredVoices.map((voice)=>{
                      const key=voiceKey(voice);
                      const selected=key===selectedVoiceKey;
                      return (
                        <div key={key} className={"scene-customize__voice-option " + (selected?"is-selected":"")}>
                          <button type="button" className="scene-customize__voice-select" onClick={()=>applyVoice(voice)}>
                            <span className="scene-customize__voice-avatar">{String(voice.name||"V").slice(0,2).toUpperCase()}</span>
                            <span><strong>{voice.name}</strong><em>{[voice.accent,voice.gender,voice.tone].filter(Boolean).join(" · ")||voice.description}</em></span>
                          </button>
                          <button type="button" className={"scene-customize__voice-preview " + (previewingVoice===key?"is-playing":"")} onClick={()=>onPreviewVoice?.(voice)}>
                            {previewLoading===key?"Loading…":previewingVoice===key?"Stop":"Preview"}
                          </button>
                        </div>
                      );
                    })}
                    {!filteredVoices.length&&<div className="scene-customize__voice-empty">No voices match “{voiceSearch}”.</div>}
                  </div>
                  <div className="scene-customize__voice-footer">{filteredVoices.length} of {voices.length} voices</div>
                </div>
              )}
            </div>
          </div>

          <div className="scene-customize__field">
            <label htmlFor={"scene-visual-query-" + scene.id}>Visual search phrase</label>
            <div className="scene-customize__query">
              <input id={"scene-visual-query-" + scene.id} value={visualQuery} onChange={(event)=>setVisualQuery(event.target.value)} placeholder="e.g. scientist using microscope" disabled={Boolean(busy)} />
              <span>{String(visualQuery.length).padStart(3,"0")}</span>
            </div>
            <small>This query is used to fetch five fresh Pexels visuals for this scene.</small>
          </div>

          <button type="button" className="scene-customize__visual-button" onClick={()=>onRegenerateVisuals?.(visualQuery)} disabled={Boolean(busy)||!visualQuery.trim()}>
            {busy==="visuals"?"Regenerating five visuals…":"Regenerate 5 visuals →"}
          </button>

          <div className="scene-customize__note"><span aria-hidden="true">↳</span><p>Changing the scene voice regenerates only this scene's narration. It does not replace your project-wide Setup voice.</p></div>
        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}
