/* Optional REAL WebGL regression (SwiftShader / Chromium), no network needed.
   Install puppeteer-core + @sparticuz/chromium without saving dependencies,
   or set CHROME_BIN to an installed browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { console.log('SKIP real WebGL: optional puppeteer-core is not installed'); process.exit(0); }

(async () => {
    let executablePath = process.env.CHROME_BIN;
    let args = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
    if (!executablePath) {
        let chromium;
        try { const mod = require('@sparticuz/chromium'); chromium = mod.default || mod; }
        catch { console.log('SKIP real WebGL: set CHROME_BIN or install optional @sparticuz/chromium'); return; }
        executablePath = await chromium.executablePath(); args = chromium.args;
    }
    const browser = await puppeteer.launch({ executablePath, args, headless: true });
    try {
        const page = await browser.newPage();
        const source = fs.readFileSync(`${__dirname}/statement-liquid.js`, 'utf8');
        const vertex = source.match(/const vertex = `([\s\S]*?)`;/)[1];
        const fragment = source.match(/const fragment = `([\s\S]*?)`;/)[1];
        const result = await page.evaluate(({ vertex, fragment }) => {
            const canvas = document.createElement('canvas');
            canvas.width = 1440; canvas.height = 900;
            const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
            if (!gl) throw new Error('WebGL not available');
            function compile(type, shaderSource) {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, shaderSource); gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
                return shader;
            }
            function makeProgram(fragmentSource) {
                const program = gl.createProgram();
                gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
                gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                return program;
            }
            const program = makeProgram(fragment);
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
            function render(time, width=1440, height=900, activeProgram=program, edgeTv=1) {
                canvas.width=width; canvas.height=height; gl.viewport(0,0,width,height);
                gl.useProgram(activeProgram);
                const position=gl.getAttribLocation(activeProgram,'position');
                gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
                gl.uniform2f(gl.getUniformLocation(activeProgram,'resolution'),width,height);
                gl.uniform2f(gl.getUniformLocation(activeProgram,'viewport'),width,height);
                gl.uniform1f(gl.getUniformLocation(activeProgram,'time'),time);
                gl.uniform1f(gl.getUniformLocation(activeProgram,'edgeTv'),edgeTv);
                gl.drawArrays(gl.TRIANGLES,0,6);
                const pixels=new Uint8Array(width*height*4);
                gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                if (gl.getError()!==gl.NO_ERROR) throw new Error('WebGL rendering error');
                return pixels;
            }
            const orbit=(t,period)=>0.5-0.5*Math.cos(t*2*Math.PI/period);
            const smoothUnion=(a,b,k=56)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*0.25;};
            function centers(t) {
                return [
                    [650+100*orbit(t,22),220+140*orbit(t,22),185],
                    [1280-400*orbit(t,19),705-265*orbit(t,19),135],
                    [1260-380*orbit(t,24),210+190*orbit(t,24),110],
                    [380+340*orbit(t,21),705-275*orbit(t,21),145],
                ];
            }
            const rgbaAt=(pixels,x,y,width=1440,height=900)=>{
                const i=((height-1-Math.floor(y))*width+Math.floor(x))*4;
                return [...pixels.slice(i,i+4)];
            };
            const luma=([r,g,b])=>0.2126*r+0.7152*g+0.0722*b;
            const frames=[0,6,10,13,17,24].map(t=>[t,render(t)]);
            const first=frames[0][1], fused=frames.find(([t])=>t===10)[1];
            const noFringe=render(0,1440,900,program,0);
            let tvFringeInside=0,tvFringeOutside=0;
            for (let i=0;i<first.length;i+=4) {
                const delta=Math.abs(first[i]-noFringe[i])+Math.abs(first[i+1]-noFringe[i+1])+Math.abs(first[i+2]-noFringe[i+2]);
                if (delta<=3) continue;
                if (noFringe[i+3]===0) tvFringeOutside++;
                else tvFringeInside++;
            }
            const dryPatch=[];
            let greenBeyondElastic=0,greenPixels=0,changed=0,maxGreenProtrusion=0;
            for (const [t,pixels] of frames) {
                const cs=centers(t);
                for (let i=0;i<pixels.length;i+=4) {
                    const x=(i/4)%1440+0.5, y=900-Math.floor(i/4/1440)-0.5;
                    const isGreen=pixels[i+3]>20 && pixels[i+1]>pixels[i]+8;
                    if (isGreen) {
                        greenPixels++;
                        const dV=smoothUnion(Math.hypot(x-cs[0][0],y-cs[0][1])-cs[0][2],Math.hypot(x-cs[1][0],y-cs[1][1])-cs[1][2]);
                        const dG=smoothUnion(Math.hypot(x-cs[2][0],y-cs[2][1])-cs[2][2],Math.hypot(x-cs[3][0],y-cs[3][1])-cs[3][2]);
                        const protrusion=smoothUnion(dV,dG);
                        maxGreenProtrusion=Math.max(maxGreenProtrusion,protrusion);
                        if (protrusion>24) greenBeyondElastic++;
                    }
                    if (pixels[i]!==first[i] || pixels[i+1]!==first[i+1] || pixels[i+2]!==first[i+2] || pixels[i+3]!==first[i+3]) changed++;
                }
            }
            const touchFrame=frames.find(([t])=>t===6)[1], touchCenters=centers(6);
            const withoutMagnet=fragment
                .replace('float sameVioletMagnet=1.0-smoothstep(-12.0,56.0,max(baseD1,baseD2));','float sameVioletMagnet=0.0;')
                .replace('float sameGreenMagnet=1.0-smoothstep(-12.0,56.0,max(baseD3,baseD4));','float sameGreenMagnet=0.0;')
                .replace('float crossMagnet=1.0-smoothstep(-12.0,56.0,max(baseV,baseG));','float crossMagnet=0.0;');
            if (!withoutMagnet.includes('float crossMagnet=0.0;')) throw new Error('Magnetic shape control did not apply');
            const noMagnetFrame=render(6,1440,900,makeProgram(withoutMagnet));
            let magneticContourChanged=0,crossBridgeSamples=0,crossBridgeVisible=0,crossBridgeMixed=0;
            for (let i=0;i<touchFrame.length;i+=4) {
                const x=(i/4)%1440+0.5,y=900-Math.floor(i/4/1440)-0.5;
                const nearContour=touchCenters.some(([cx,cy,r])=>Math.abs(Math.hypot(x-cx,y-cy)-r)<26);
                if (!nearContour) continue;
                const delta=Math.abs(touchFrame[i]-noMagnetFrame[i])+Math.abs(touchFrame[i+1]-noMagnetFrame[i+1])+
                    Math.abs(touchFrame[i+2]-noMagnetFrame[i+2])+Math.abs(touchFrame[i+3]-noMagnetFrame[i+3]);
                if (delta>28) magneticContourChanged++;
            }
            for (let i=0;i<touchFrame.length;i+=4) {
                const x=(i/4)%1440+0.5,y=900-Math.floor(i/4/1440)-0.5;
                const dV=smoothUnion(Math.hypot(x-touchCenters[0][0],y-touchCenters[0][1])-touchCenters[0][2],
                    Math.hypot(x-touchCenters[1][0],y-touchCenters[1][1])-touchCenters[1][2]);
                const dG=smoothUnion(Math.hypot(x-touchCenters[2][0],y-touchCenters[2][1])-touchCenters[2][2],
                    Math.hypot(x-touchCenters[3][0],y-touchCenters[3][1])-touchCenters[3][2]);
                if (dV<=2 || dG<=2 || smoothUnion(dV,dG)>=-1) continue;
                crossBridgeSamples++;
                if (touchFrame[i+3]>30) {
                    crossBridgeVisible++;
                    const [r,g,b]=touchFrame.subarray(i,i+3);
                    if (r>90 && g>100 && g<230 && b>45 && b<245) crossBridgeMixed++;
                }
            }
            const fusedCenters=centers(10);
            let fusedGreenRimSamples=0,fusedGreenRimBlended=0;
            for (let i=0;i<fused.length;i+=4) {
                const x=(i/4)%1440+0.5,y=900-Math.floor(i/4/1440)-0.5;
                const dV=smoothUnion(Math.hypot(x-fusedCenters[0][0],y-fusedCenters[0][1])-fusedCenters[0][2],
                    Math.hypot(x-fusedCenters[1][0],y-fusedCenters[1][1])-fusedCenters[1][2]);
                const dG=smoothUnion(Math.hypot(x-fusedCenters[2][0],y-fusedCenters[2][1])-fusedCenters[2][2],
                    Math.hypot(x-fusedCenters[3][0],y-fusedCenters[3][1])-fusedCenters[3][2]);
                if (Math.abs(dG)>8 || dV>-24) continue;
                fusedGreenRimSamples++;
                const [r,g,b]=fused.subarray(i,i+3);
                if (fused[i+3]>190 && r>90 && g>100 && g<230 && b>45 && b<245) fusedGreenRimBlended++;
            }
            for (let y=180;y<240;y++) for (let x=1230;x<1290;x++) dryPatch.push(rgbaAt(first,x,y));
            const dryAlphaMin=Math.min(...dryPatch.map(v=>v[3]));
            const dryAlphaMax=Math.max(...dryPatch.map(v=>v[3]));
            const dryFillCoverage=dryPatch.filter(v=>v[3]>70 && v[1]>v[0]+30 && v[1]>v[2]+100).length/dryPatch.length;
            const violetCenter=rgbaAt(first,650,220), violetRim=rgbaAt(first,790,220);
            const greenCenter=rgbaAt(first,1260,210), greenInterior=rgbaAt(first,1340,210);
            const flatColorDifference=Math.max(
                ...violetCenter.slice(0,3).map((v,i)=>Math.abs(v-violetRim[i])),
                ...greenCenter.slice(0,3).map((v,i)=>Math.abs(v-greenInterior[i]))
            );
            const flatSphereContrast=Math.max(
                Math.abs(luma(violetCenter)-luma(violetRim)),
                Math.abs(luma(greenCenter)-luma(greenInterior))
            );

            // A flat-fill control keeps all geometry and alpha but removes only
            // the contact-born liquid color, so the actual fusion contribution is measurable.
            const withoutLiquid=fragment
                .replace('vec3 greenColor=mix(green,dissolved,wet*0.88);','vec3 greenColor=green;')
                .replace('float mergedPigment=crossFusion*(0.82+0.17*pooling);','float mergedPigment=0.0;');
            if (withoutLiquid===fragment) throw new Error('Liquid color control did not apply');
            const dryLiquidControl=render(0,1440,900,makeProgram(withoutLiquid));
            const fusedLiquidControl=render(10,1440,900,makeProgram(withoutLiquid));
            let fusionSamples=0, liquidPixels=0, fusedAlpha=0;
            const cs=centers(10);
            for (let i=0;i<fused.length;i+=4) {
                const x=(i/4)%1440+0.5,y=900-Math.floor(i/4/1440)-0.5;
                const d=cs.map(([cx,cy,r])=>Math.hypot(x-cx,y-cy)-r);
                const singleGreen=(d[2]<-12 && d[3]>12)||(d[3]<-12 && d[2]>12);
                const violetDistance=Math.min(d[0],d[1]);
                if (!singleGreen || violetDistance>-70) continue;
                fusionSamples++;
                if (fused[i+3]>170) fusedAlpha++;
                const delta=Math.abs(fused[i]-fusedLiquidControl[i])+
                    Math.abs(fused[i+1]-fusedLiquidControl[i+1])+Math.abs(fused[i+2]-fusedLiquidControl[i+2]);
                if (delta>18) liquidPixels++;
            }
            const greenUnionGap=(t,index)=>{
                const drops=centers(t),g=drops[index];
                return Math.min(...drops.slice(0,2).map(v=>Math.hypot(g[0]-v[0],g[1]-v[1])-g[2]-v[2]));
            };
            const initialSeparation=Math.min(greenUnionGap(0,2),greenUnionGap(0,3));
            const joinedGap=Math.max(greenUnionGap(10,2),greenUnionGap(10,3));
            const mobile=render(10,390,443);
            const mobileVisible=mobile.filter((v,i)=>i%4===3 && v>30).length;
            return {greenBeyondElastic,maxGreenProtrusion,greenPixels,changed,dryAlphaMin,dryAlphaMax,dryFillCoverage,
                tvFringeInside,tvFringeOutside,flatColorDifference,flatSphereContrast,magneticContourChanged,crossBridgeSamples,crossBridgeVisible,crossBridgeMixed,
                fusedGreenRimSamples,fusedGreenRimBlended,fusionSamples,liquidPixels,
                fusedAlphaRatio:fusedAlpha/Math.max(1,fusionSamples),initialSeparation,joinedGap,mobileVisible};
        }, { vertex, fragment });
        assert.equal(result.greenBeyondElastic,0,'Magnetic shape flex stays within a 24px elastic contour envelope');
        assert.ok(result.tvFringeInside>1000,'The chromatic television fringe is visible along circle edges');
        assert.equal(result.tvFringeOutside,0,'The chromatic fringe never changes black-background pixels');
        assert.ok(result.magneticContourChanged>100,'Turning off attraction measurably restores the unpulled circle contours');
        assert.ok(result.crossBridgeSamples>0,'Green and violet circles create a shared bridge region at contact');
        assert.ok(result.crossBridgeVisible/result.crossBridgeSamples>0.65,'The green-violet bridge is visibly filled inside the shared silhouette');
        assert.ok(result.crossBridgeMixed>0,'The cross-color bridge contains intermediate green-violet color, not just overlapping solid fills');
        assert.ok(result.fusedGreenRimSamples>100,'The frame includes green boundary pixels fused inside the violet field');
        assert.ok(result.fusedGreenRimBlended/result.fusedGreenRimSamples>0.7,'Most of the green circular rim is dissolved into the fragmented ink mix where it is fused inside violet');
        assert.ok(result.greenPixels>10000,'Both solid green fills render');
        assert.ok(result.dryFillCoverage>0.99,'An isolated green circle is filled throughout');
        assert.ok(result.dryAlphaMin>70 && result.dryAlphaMax-result.dryAlphaMin<3,'Dry green fill is uniform, with no hatch or shading');
        assert.ok(result.flatColorDifference<3,'Violet and green circles have flat color across their surfaces');
        assert.ok(result.flatSphereContrast<2,'No spherical light-to-limb contrast remains');
        assert.ok(result.changed>10000,'The moving circles and contact color produce different frames');
        assert.ok(result.initialSeparation>120,'Green circles start separated from the violet pair');
        assert.ok(result.joinedGap<-50,'The four circles still converge into a strong overlap');
        assert.ok(result.fusionSamples>1000,'Substantial contact area sampled');
        assert.ok(result.liquidPixels>1000,'Contact creates a visible liquid color mix');
        assert.ok(result.fusedAlphaRatio>0.98,'Contact fusion is visibly more saturated than the dry fill');
        assert.ok(result.mobileVisible>1000,'Mobile crop retains the effect');
        assert.ok(!fragment.includes('retainedContact'),'Fusion no longer persists after geometric separation');
        console.log('PASS real WebGL: flat fills, elastic motion and magnetic contact, preserved orbit, bounded contours and mobile crop',result);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
