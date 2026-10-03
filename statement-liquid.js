/* Procedural liquid-light study, not stock footage. Native WebGL 1, no runtime
   dependencies. The SVG remains the fallback until a frame renders successfully.
   Four flat-color drops retain circular bodies at rest; motion gives their
   contours a restrained elastic flex and magnetic contact stretches them. */
(() => {
    "use strict";
    const host = document.querySelector(".statement-background");
    if (!host) return;
    const canvas = document.createElement("canvas");
    canvas.className = "statement-liquid";
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);
    const gl = canvas.getContext("webgl", {
        alpha: true, premultipliedAlpha: false, antialias: false,
        depth: false, stencil: false, powerPreference: "low-power",
    });
    if (!gl) { canvas.remove(); return; }

    const vertex = `attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
    const fragment = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 resolution;
    uniform vec2 viewport;
    uniform float time;
    uniform float edgeTv;
    const vec3 violet = vec3(0.627, 0.392, 1.0);
    const vec3 green = vec3(0.639, 0.875, 0.008);

    float orbitAt(float period, float clock) { return 0.5-0.5*cos(clock*6.2831853/period); }
    float smoothUnion(float a, float b, float k) {
        float h=max(k-abs(a-b),0.0)/max(k,0.001);
        return min(a,b)-h*h*k*0.25;
    }
    vec2 center1At(float clock) {
        return vec2(790,350)+mix(vec2(-140,-130),vec2(-40,10),orbitAt(22.0,clock));
    }
    vec2 center2At(float clock) {
        return vec2(1190,640)+mix(vec2(90,65),vec2(-310,-200),orbitAt(19.0,clock));
    }
    vec2 center3At(float clock) {
        return vec2(1180,280)+mix(vec2(80,-70),vec2(-300,120),orbitAt(24.0,clock));
    }
    vec2 center4At(float clock) {
        return vec2(470,640)+mix(vec2(-90,65),vec2(250,-210),orbitAt(21.0,clock));
    }
    float wetFront(float distance, vec2 p, float depth) {
        // Fusion exists only at the current contact: no temporal persistence.
        float ripple=sin(p.x*0.032+1.7*sin(p.y*0.023-time*0.23)+time*0.17)
                    *sin(p.y*0.041-p.x*0.015+time*0.19);
        float penetration=max(0.0,-distance);
        float onset=(1.0-exp(-penetration/2.5))*0.48;
        float deep=1.0-smoothstep(-depth*(1.0+0.34*ripple),0.0,distance);
        return onset+(1.0-onset)*deep;
    }
    float inkHash(vec2 p) {
        p=fract(p*vec2(123.34,345.45));
        p+=dot(p,p+34.345);
        return fract(p.x*p.y);
    }
    float inkNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p);
        f=f*f*(3.0-2.0*f);
        float a=inkHash(i), b=inkHash(i+vec2(1.0,0.0));
        float c=inkHash(i+vec2(0.0,1.0)), d=inkHash(i+vec2(1.0,1.0));
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }
    float elasticCircleDistance(vec2 p, vec2 center, float radius, float base,
                                vec2 velocity, vec2 pull, float magnet, float phase) {
        // A small velocity-led flex keeps the body circular at rest. Magnetic
        // pull only swells the facing edge while the other metaball is nearby;
        // every term is derived from current position, with no temporal memory.
        if (abs(base)>28.0) return base;
        vec2 delta=p-center;
        float radial=max(base+radius,0.001);
        vec2 normal=delta/radial;
        float speed=clamp(length(velocity)/80.0,0.0,1.0);
        vec2 moveDir=velocity/max(length(velocity),0.001);
        float alongMove=dot(normal,moveDir);
        float angle=atan(normal.y,normal.x);
        float forward=max(alongMove,0.0), trailing=max(-alongMove,0.0);
        float sideCompression=1.0-alongMove*alongMove;
        float motionStretch=speed*(10.5*forward*forward+4.5*trailing*trailing-5.6*sideCompression)
                           +speed*0.6*sin(angle*2.0+time*0.55+phase);
        float magnetic=0.0;
        if (magnet>0.001) {
            vec2 pullDir=pull/max(length(pull),0.001);
            float facing=dot(normal,pullDir);
            float front=max(facing,0.0), back=max(-facing,0.0);
            float side=1.0-facing*facing;
            float pulse=1.0+0.14*sin(time*1.15+phase);
            magnetic=magnet*pulse*(15.0*front*front-5.0*side-1.2*back*back);
        }
        return base-motionStretch-magnetic;
    }
    vec2 eddy(vec2 p, vec2 center, float radius, float angle) {
        vec2 d=p-center;
        float theta=angle*exp(-dot(d,d)/(radius*radius));
        float s=sin(theta), c=cos(theta);
        return center+vec2(c*d.x-s*d.y,s*d.x+c*d.y);
    }
    vec2 transport(vec2 p, vec2 c3, vec2 c4, float strength, float fusion) {
        // Broader currents move the contact-born color farther inside the
        // circles; there is no independent swirl or line-texture layer.
        vec2 q=eddy(p,c3+vec2(-22,12),98.0,strength*fusion*(1.05+0.5*sin(time*0.43)));
        q=eddy(q,c4+vec2(24,-20),116.0,-strength*fusion*(1.2+0.55*sin(time*0.38+1.1)));
        vec2 middle=mix(c3,c4,0.5);
        q=eddy(q,middle+vec2(-42,-45),108.0,strength*(1.4+0.55*sin(time*0.28)));
        q=eddy(q,middle+vec2(34,42),88.0,-strength*(1.5+0.6*sin(time*0.23+1.7)));
        return eddy(q,c3+vec2(5,-24),68.0,strength*0.85*sin(time*0.31+0.8));
    }
    void main() {
        vec2 pixel=vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y);
        vec2 cssPixel=pixel*viewport/resolution;
        // Match the SVG's desktop cover and mobile 150% / -45% crop.
        float mobile=1.0-step(600.5,viewport.x);
        float scale=max(viewport.x*mix(1.0,1.5,mobile)/1440.0,viewport.y/900.0);
        vec2 anchor=vec2(viewport.x*mix(0.5,0.3,mobile),viewport.y*0.5);
        vec2 p=(cssPixel-anchor)/scale+vec2(720,450);
        float aa=max(0.35,0.65*viewport.x/resolution.x/scale);
        vec2 c1=center1At(time), c2=center2At(time);
        vec2 c3=center3At(time), c4=center4At(time);
        float orbitPhase1=sin(time*6.2831853/22.0);
        float orbitPhase2=sin(time*6.2831853/19.0);
        float orbitPhase3=sin(time*6.2831853/24.0);
        float orbitPhase4=sin(time*6.2831853/21.0);
        vec2 v1=vec2(100,140)*(3.14159265/22.0)*orbitPhase1;
        vec2 v2=vec2(-400,-265)*(3.14159265/19.0)*orbitPhase2;
        vec2 v3=vec2(-380,190)*(3.14159265/24.0)*orbitPhase3;
        vec2 v4=vec2(340,-275)*(3.14159265/21.0)*orbitPhase4;
        float baseD1=length(p-c1)-185.0, baseD2=length(p-c2)-135.0;
        float baseD3=length(p-c3)-110.0, baseD4=length(p-c4)-145.0;
        float baseV=smoothUnion(baseD1,baseD2,56.0);
        float baseG=smoothUnion(baseD3,baseD4,56.0);
        float sameVioletMagnet=1.0-smoothstep(-12.0,56.0,max(baseD1,baseD2));
        float sameGreenMagnet=1.0-smoothstep(-12.0,56.0,max(baseD3,baseD4));
        float crossMagnet=1.0-smoothstep(-12.0,56.0,max(baseV,baseG));
        vec2 violetCenter=(c1+c2)*0.5, greenCenter=(c3+c4)*0.5;
        float magnet1=max(sameVioletMagnet,crossMagnet);
        float magnet2=max(sameVioletMagnet,crossMagnet);
        float magnet3=max(sameGreenMagnet,crossMagnet);
        float magnet4=max(sameGreenMagnet,crossMagnet);
        vec2 pull1=crossMagnet>sameVioletMagnet?greenCenter-c1:c2-c1;
        vec2 pull2=crossMagnet>sameVioletMagnet?greenCenter-c2:c1-c2;
        vec2 pull3=crossMagnet>sameGreenMagnet?violetCenter-c3:c4-c3;
        vec2 pull4=crossMagnet>sameGreenMagnet?violetCenter-c4:c3-c4;
        float violetD1=elasticCircleDistance(p,c1,185.0,baseD1,v1,pull1,magnet1,0.3);
        float violetD2=elasticCircleDistance(p,c2,135.0,baseD2,v2,pull2,magnet2,1.7);
        float dV=smoothUnion(violetD1,violetD2,56.0);
        float violetShape=1.0-smoothstep(-aa,aa,dV);
        float d3=elasticCircleDistance(p,c3,110.0,baseD3,v3,pull3,magnet3,2.8);
        float d4=elasticCircleDistance(p,c4,145.0,baseD4,v4,pull4,magnet4,4.1);
        float dUnion=smoothUnion(d3,d4,56.0);
        float greenShape=1.0-smoothstep(-aa,aa,dUnion);
        float crossContact=1.0-smoothstep(-16.0,24.0,max(dV,dUnion));
        float orbitMotion=max(max(abs(orbitPhase1),abs(orbitPhase2)),
                              max(abs(orbitPhase3),abs(orbitPhase4)));
        float edgePulse=mix(8.0,13.0,orbitMotion);
        float inkWave=sin(p.x*0.019+1.5*sin(p.y*0.024-time*0.24))
                     *sin(p.y*0.021-p.x*0.012+time*0.17);
        // The separated edge flex remains subtle; the magnetic deformation
        // grows only as the opposite fields approach, then the shared boundary
        // gets a stronger liquid pulse as the circles travel faster.
        float dAll=smoothUnion(dV,dUnion,64.0)-edgePulse*inkWave*crossContact;
        float allShape=1.0-smoothstep(-aa,aa,dAll);
        if (allShape<=0.0) {
            gl_FragColor=vec4(0.0);
            return;
        }
        float bridgeShape=max(0.0,allShape-max(violetShape,greenShape));
        float crossFusion=max(bridgeShape,min(violetShape,greenShape));
        // Extend the mixing zone across the green rim while it lies inside violet.
        float crossProximity=1.0-smoothstep(0.0,48.0,max(dV,dUnion));
        float contactMix=max(crossFusion,crossProximity);
        float greenContact=max(wetFront(dV,p,64.0),wetFront(max(d3,d4),p,42.0))*greenShape;
        float wet=max(greenContact,bridgeShape);
        float fusion=smoothstep(0.28,0.76,max(wet,contactMix));
        float flow=max(wet*wet*max(smoothstep(0.0,18.0,-dUnion),bridgeShape),contactMix*0.72)
                  *mix(0.82,1.40,orbitMotion);
        vec2 q=transport(p,c3,c4,flow,fusion);
        // Advected, low-frequency pigment clouds replace the circular distance
        // boundary only during contact; separated discs retain their flat colors.
        float river=sin(q.x*0.032+1.35*sin(q.y*0.024-time*0.19)+time*0.14)
                   *sin(q.y*0.038-q.x*0.014+time*0.17);
        float poolingRaw=smoothstep(-0.42,0.48,river);
        vec2 inkP=q*0.015+vec2(time*0.035,-time*0.027);
        float inkCoarse=inkNoise(inkP);
        float inkMedium=inkNoise(inkP*2.25+vec2(8.1,5.7));
        float inkFine=inkNoise(inkP*4.5+vec2(-13.4,19.2));
        float inkCloud=0.50*inkCoarse+0.32*inkMedium+0.18*inkFine;
        float inkPool=smoothstep(0.38,0.62,inkCloud);
        float inkFray=smoothstep(0.35,0.67,0.58*inkMedium+0.42*inkFine);
        // Fine and medium ink turbulence frays the wider pigment pools instead
        // of merely changing opacity; this keeps the break-up legible at a glance.
        float frayedPool=clamp(inkPool+(inkFray-0.5)*0.32,0.0,1.0);
        float pooling=mix(poolingRaw,frayedPool,contactMix);
        vec3 dissolved=mix(vec3(0.31,0.86,0.83),vec3(0.72,0.87,0.28),pooling);
        dissolved=mix(vec3(0.64,0.59,0.91),dissolved,smoothstep(0.0,0.3,pooling));
        vec3 greenColor=mix(green,dissolved,wet*0.88);
        // Render one shared alpha silhouette, rather than compositing separate
        // violet and green disks. This removes their circular edges in the fused
        // area while a smooth distance blend keeps both flat colors elsewhere.
        float blendWidth=mix(42.0,190.0,crossFusion);
        float colorFront=dV-dUnion+river*160.0*crossFusion;
        float distanceWeight=smoothstep(-blendWidth,blendWidth,colorFront);
        // Replace the circular distance boundary with the advected ink field
        // throughout contact; keep the distance split only while colors are apart.
        float greenWeight=mix(distanceWeight,pooling,contactMix);
        vec3 color=mix(violet,greenColor,greenWeight);
        // A contact-only pigment wash spreads through the overlap, erasing the
        // remaining round cut-lines without tinting isolated, separated discs.
        float mergedPigment=crossFusion*(0.82+0.17*pooling);
        color=mix(color,dissolved,mergedPigment);
        // A soft red/cyan rim is mixed only into the interior alpha silhouette.
        // No fringe pixel is emitted into the black background around the orbs.
        float closestOrb=baseD1;
        vec2 fringeVector=p-c1;
        if (baseD2<closestOrb) { closestOrb=baseD2; fringeVector=p-c2; }
        if (baseD3<closestOrb) { closestOrb=baseD3; fringeVector=p-c3; }
        if (baseD4<closestOrb) { fringeVector=p-c4; }
        vec2 fringeNormal=fringeVector/max(length(fringeVector),0.001);
        float fringeBand=(1.0-smoothstep(0.0,22.0,max(0.0,-dAll)))*step(dAll,0.0);
        float fringeAmount=clamp(edgeTv,0.0,1.0)*fringeBand*0.32;
        vec3 fringeColor=mix(vec3(1.0,0.10,0.28),vec3(0.04,0.80,1.0),smoothstep(-0.2,0.2,fringeNormal.x));
        color=mix(color,fringeColor,fringeAmount);
        float unionWet=max(greenContact,contactMix);
        float alpha=allShape*mix(0.36,0.90,unionWet);
        gl_FragColor=vec4(color,alpha);
    }`;


    let program, buffer;
    function compile(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message);
        }
        return shader;
    }
    try {
        const vs = compile(gl.VERTEX_SHADER, vertex);
        const fs = compile(gl.FRAGMENT_SHADER, fragment);
        program = gl.createProgram();
        gl.attachShader(program, vs); gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Liquid shader link failed");
        gl.useProgram(program);
        buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program,"position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    } catch (error) {
        console.warn("Liquid background: using SVG fallback.", error);
        if (program) gl.deleteProgram(program);
        canvas.remove(); return;
    }
    const uResolution = gl.getUniformLocation(program,"resolution");
    const uTime = gl.getUniformLocation(program,"time");
    const uEdgeTv = gl.getUniformLocation(program,"edgeTv");
    const uViewport = gl.getUniformLocation(program,"viewport");
    let width = 1, height = 1;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, elapsed = 0, last = 0, visible = false, lost = false;
    function resize() {
        const rect = host.getBoundingClientRect();
        width = Math.max(1,rect.width); height = Math.max(1,rect.height);
        // Limit fill rate on high-DPI phones / 4K screens; CSS keeps full size.
        const dpr = Math.min(devicePixelRatio || 1, 1.25, 1200/Math.max(rect.width,1));
        canvas.width = Math.max(1,Math.round(rect.width*dpr));
        canvas.height = Math.max(1,Math.round(rect.height*dpr));
        gl.viewport(0,0,canvas.width,canvas.height);
    }
    function draw() {
        gl.uniform2f(uResolution,canvas.width,canvas.height);
        gl.uniform2f(uViewport,width,height);
        gl.uniform1f(uTime,elapsed);
        gl.uniform1f(uEdgeTv,Math.max(0,Math.min(1,parseFloat(host.style.getPropertyValue("--statement-edge-tv"))||0)));
        gl.drawArrays(gl.TRIANGLES,0,6);
    }
    function frame(now) {
        raf = 0;
        if (last && now-last<32) { raf = requestAnimationFrame(frame); return; }
        if (last) elapsed += (now-last)/1000;
        last = now; draw();
        raf = requestAnimationFrame(frame);
    }
    function sync() {
        const active = !lost && visible && !document.hidden && !motion.matches && host.classList.contains("is-animating");
        if (active && !raf) { last=0; raf=requestAnimationFrame(frame); }
        if (!active && raf) { cancelAnimationFrame(raf); raf=0; last=0; }
    }
    resize(); draw();
    if (gl.getError() !== gl.NO_ERROR) { canvas.remove(); return; }
    host.classList.add("has-liquid");
    // Pause SVG animations when the canvas replaces them, but retain the
    // existing is-animating lifecycle (including preloader readiness).
    new MutationObserver(sync).observe(host,{attributes:true,attributeFilter:["class"]});
    new IntersectionObserver((entries) => { visible=entries[0].isIntersecting; sync(); }).observe(host);
    new ResizeObserver(() => { if (!lost) { resize(); draw(); } }).observe(host);
    document.addEventListener("visibilitychange",sync);
    motion.addEventListener("change",sync);
    canvas.addEventListener("webglcontextlost",(event) => {
        event.preventDefault(); lost=true; sync();
        host.classList.remove("has-liquid");
        // Keep the SVG fallback for this visit rather than allocate another context.
        canvas.style.display="none";
    });
})();
