#version 100
precision highp float;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProjection;

attribute vec3 aPosition;
varying vec3 pos;

void main() {
    gl_Position = uProjection * uView * uModel * vec4(aPosition, 1);
    pos = (uModel * vec4(aPosition, 1)).xyz;
}


__split__


#version 100
precision highp float;

uniform vec3 uPosition;
uniform vec3 uColor;       // star (disk) color
uniform vec3 uFlareColor;  // flare color
uniform float uSize;
uniform float uFalloff;
uniform float uBrightness;
uniform float uFlare;

varying vec3 pos;

void main() {
    vec3 posn = normalize(pos);
    float d = clamp(dot(posn, normalize(uPosition)), 0.0, 1.0);
    float disk = smoothstep(1.0 - uSize * 32.0, 1.0 - uSize, d);
    float flare = pow(d, uFalloff) * uFlare;
    // Star core: uColor at the rim fading to white-hot at the very center.
    vec3 starColor = mix(uColor, vec3(1, 1, 1), disk);
    // The flare keeps its own color; blend over to the star color on the disk.
    vec3 color = mix(uFlareColor, starColor, disk);
    float a = (disk + flare) * uBrightness;
    gl_FragColor = vec4(color, a);
}
