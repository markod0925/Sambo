import { HARMONIC_BAND_COUNT, clampUnit } from '../../core/harmonicBands.js';

export const HARMONIC_BANDS_PIPELINE_KEY = 'SamboHarmonicBands';

const HARMONIC_BANDS_FRAGMENT_SHADER = `
#define SHADER_NAME SAMBO_HARMONIC_BANDS_FS

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uBeatPhase;
uniform float uPC[12];

// Annex A mandated constants for RFC-001.
const int N_BANDS = 12;
const float PI2 = 6.28318530718;
const float sigmaMin = 0.008;
const float sigmaMax = 0.018;
const float lineWidthMin = 0.0024;
const float lineWidthMax = 0.0068;
const float edgeSoftness = 0.0018;
const float ampBase = 0.020;
const float ampMax = 0.205;
const float breatheAmp = 0.08;
const float vStrength = 0.15;

const vec3 BG0 = vec3(0.019607843, 0.027450980, 0.058823529);
const vec3 BG1 = vec3(0.043137255, 0.062745098, 0.125490196);
const vec3 BG2 = vec3(0.066666667, 0.101960784, 0.180392157);

const vec3 GlowCool = vec3(0.227450980, 0.274509804, 0.388235294);
const vec3 GlowWarm = vec3(0.788235294, 0.635294118, 0.152941176);
const vec3 MoonIvory = vec3(0.909803922, 0.901960784, 0.890196078);

const vec3 Band0 = vec3(0.168627451, 0.203921569, 0.298039216);
const vec3 Band1 = vec3(0.192156863, 0.231372549, 0.333333333);
const vec3 Band2 = vec3(0.215686275, 0.258823529, 0.380392157);
const vec3 Band3 = vec3(0.231372549, 0.294117647, 0.419607843);
const vec3 Band4 = vec3(0.203921569, 0.337254902, 0.388235294);
const vec3 Band5 = vec3(0.184313725, 0.301960784, 0.341176471);
const vec3 Band6 = vec3(0.290196078, 0.290196078, 0.333333333);
const vec3 Band7 = vec3(0.352941176, 0.301960784, 0.294117647);
const vec3 Band8 = vec3(0.419607843, 0.333333333, 0.258823529);
const vec3 Band9 = vec3(0.478431373, 0.368627451, 0.227450980);
const vec3 Band10 = vec3(0.541176471, 0.415686275, 0.200000000);
const vec3 Band11 = vec3(0.419607843, 0.372549020, 0.227450980);

vec3 bandColorFromIndex(const float idx) {
  vec3 color = Band0;
  color = mix(color, Band1, step(0.5, idx));
  color = mix(color, Band2, step(1.5, idx));
  color = mix(color, Band3, step(2.5, idx));
  color = mix(color, Band4, step(3.5, idx));
  color = mix(color, Band5, step(4.5, idx));
  color = mix(color, Band6, step(5.5, idx));
  color = mix(color, Band7, step(6.5, idx));
  color = mix(color, Band8, step(7.5, idx));
  color = mix(color, Band9, step(8.5, idx));
  color = mix(color, Band10, step(9.5, idx));
  color = mix(color, Band11, step(10.5, idx));
  return color;
}

vec3 saturateColor(vec3 color, float amount) {
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 gray = vec3(luma);
  return clamp(gray + (color - gray) * amount, 0.0, 1.0);
}

void main() {
  vec2 uv = outTexCoord;
  float intensity = clamp(uIntensity, 0.0, 1.0);
  float beat = clamp(uBeatPhase, 0.0, 1.0);
  float breathe = 1.0 + breatheAmp * sin(PI2 * (beat + 0.15 * sin(0.5 * uTime)));

  float backgroundWave = 0.5 + 0.5 * sin(0.04 * uTime);
  vec3 base = mix(BG0, BG1, uv.y);
  base = mix(base, BG2, 0.18 * backgroundWave);

  vec3 bands = vec3(0.0);
  for (int i = 0; i < N_BANDS; i++) {
    float pc = clamp(uPC[i], 0.0, 1.0);
    float fi = float(i);
    float center = (fi + 0.5) / float(N_BANDS);
    float waveFreq = 0.58 + fi * 0.043;
    float wavePhase = fi * 0.137;
    float waveA = sin(PI2 * (uv.x * waveFreq + 0.11 * uTime + wavePhase));
    float waveB = sin(PI2 * (uv.x * (waveFreq * 1.37) - 0.085 * uTime + fi * 0.211));
    float waveC = sin(PI2 * (uv.x * (waveFreq * 0.53) + 0.047 * uTime + fi * 0.319));
    float waveD = sin(PI2 * (uv.x * (waveFreq * 2.41) - 0.027 * uTime + fi * 0.127));
    float weavePulse = 0.5 + 0.5 * sin(PI2 * (0.16 * uTime + fi * 0.083));
    float warpAmp = mix(0.012, 0.066, intensity) * (0.62 + 1.05 * pc);
    float ribbonOffset = (waveA + 0.78 * waveB + 0.55 * waveC + 0.32 * waveD) * warpAmp;
    float crossSkew = (waveA * waveB + 0.6 * waveC * waveD) * warpAmp * (0.35 + 0.30 * weavePulse);
    float ribbonY = center + ribbonOffset + crossSkew;
    float dy = uv.y - ribbonY;
    float ady = abs(dy);

    float lineWidth = mix(lineWidthMin, lineWidthMax, intensity) * (0.78 + 0.44 * pc);
    float core = 1.0 - smoothstep(lineWidth, lineWidth + edgeSoftness, ady);
    float sigma = mix(sigmaMin, sigmaMax, intensity) * (0.72 + 0.58 * pc);
    float halo = exp(-(dy * dy) / (2.0 * sigma * sigma));
    float lineProfile = max(core, pow(halo, 0.72) * 0.42);

    float knotWave = sin(PI2 * (uv.x * (waveFreq * 2.85) + 0.03 * uTime + fi * 0.173));
    float knotMask = smoothstep(0.50, 0.96, knotWave * knotWave);
    float filament = core * (0.86 + 0.34 * knotMask);

    float amp = ampBase + ampMax * pc * intensity;
    float addStrength = min(0.25, amp * (0.58 * lineProfile + 0.42 * filament) * breathe);

    vec3 bandColor = bandColorFromIndex(float(i));
    float warmMix = smoothstep(5.5, 11.0, float(i));
    vec3 anchor = mix(GlowCool, GlowWarm, warmMix);
    vec3 compositeBand = mix(bandColor, anchor, 0.26);
    float saturationBoost = mix(1.30, 2.10, intensity) * (0.92 + 0.35 * pc);
    compositeBand = saturateColor(compositeBand, saturationBoost);
    compositeBand = mix(compositeBand, MoonIvory, 0.05 * filament);
    bands += compositeBand * addStrength;
  }

  vec3 color = base + bands;
  color += MoonIvory * min(0.05, intensity * 0.02);

  vec2 centerUv = uv - vec2(0.5);
  float safeHeight = max(1.0, uResolution.y);
  centerUv.x *= uResolution.x / safeHeight;
  float vignette = 1.0 - vStrength * dot(centerUv, centerUv);
  color *= vignette;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export class HarmonicBandsPipeline extends Phaser.Renderer.WebGL.Pipelines.SinglePipeline {
  private readonly clampedPitchClasses = new Float32Array(HARMONIC_BAND_COUNT);

  constructor(game: any) {
    super({
      game,
      name: HARMONIC_BANDS_PIPELINE_KEY,
      fragShader: HARMONIC_BANDS_FRAGMENT_SHADER,
      forceZero: true,
      resizeUniform: 'uResolution'
    });
  }

  setResolution(width: number, height: number): void {
    const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
    const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
    this.set2f('uResolution', safeWidth, safeHeight);
  }

  setTime(seconds: number): void {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.set1f('uTime', safeSeconds);
  }

  setIntensity(intensity: number): void {
    this.set1f('uIntensity', clampUnit(intensity));
  }

  setBeatPhase(beatPhase: number): void {
    this.set1f('uBeatPhase', clampUnit(beatPhase));
  }

  setPitchClasses(values: Float32Array): void {
    const limit = Math.min(HARMONIC_BAND_COUNT, values?.length ?? 0);
    for (let i = 0; i < HARMONIC_BAND_COUNT; i++) {
      this.clampedPitchClasses[i] = i < limit ? clampUnit(values[i]) : 0;
    }
    this.set1fv('uPC', this.clampedPitchClasses);
  }
}
