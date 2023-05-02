import * as THREE from "three"
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import * as Curves from 'three/addons/curves/CurveExtras.js';
import { MathUtils } from 'three';


let container, stats;

let camera, scene, renderer, splineCamera, cameraHelper, cameraEye;

const direction = new THREE.Vector3();
const binormal = new THREE.Vector3();
const normal = new THREE.Vector3();
const position = new THREE.Vector3();
const lookAt = new THREE.Vector3();

// [x] custom globals
let loopFactor = 20 * 10000;

let radius = 2;

let gridResolutionXY = new THREE.Vector2(0.25, 0.0);
let extrudePath;

let tunnel_faceColor = new THREE.Color("#000000")
let tunnel_faceColor_alpha = 0.7;
// let tunnel_faceColorVec4 = new THREE.Vector4(tunnel_faceColor.r, tunnel_faceColor.g, tunnel_faceColor.b, tunnel_faceColor_alpha)

let grid_linewidth = new THREE.Vector2(5.0, 0)
let bg_color = new THREE.Color("rgb(200,10,30)");
let line_color = new THREE.Color("rgb(255,255,255)");
let mat_transparency_flag = true;

let sphere;
let spherePos = new THREE.Vector3(0, 0, 0)

const pipeSpline = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 10, - 10), new THREE.Vector3(10, 0, - 10),
    new THREE.Vector3(20, 0, 0), new THREE.Vector3(30, 0, 10),
    new THREE.Vector3(30, 0, 20), new THREE.Vector3(20, 0, 30),
    new THREE.Vector3(10, 0, 30), new THREE.Vector3(0, 0, 30),
    new THREE.Vector3(- 10, 10, 30), new THREE.Vector3(- 10, 20, 30),
    new THREE.Vector3(0, 30, 30), new THREE.Vector3(10, 30, 30),
    new THREE.Vector3(20, 30, 15), new THREE.Vector3(10, 30, 10),
    new THREE.Vector3(0, 30, 10), new THREE.Vector3(- 10, 20, 10),
    new THREE.Vector3(- 10, 10, 10), new THREE.Vector3(0, 0, 10),
    new THREE.Vector3(10, - 10, 10), new THREE.Vector3(20, - 15, 10),
    new THREE.Vector3(30, - 15, 10), new THREE.Vector3(40, - 15, 10),
    new THREE.Vector3(50, - 15, 10), new THREE.Vector3(60, 0, 10),
    new THREE.Vector3(70, 0, 0), new THREE.Vector3(80, 0, 0),
    new THREE.Vector3(90, 0, 0), new THREE.Vector3(100, 0, 0)
]);

const sampleClosedSpline = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, - 40, - 40),
    new THREE.Vector3(0, 40, - 40),
    new THREE.Vector3(0, 140, - 40),
    new THREE.Vector3(0, 40, 40),
    new THREE.Vector3(0, - 40, 40)
]);

sampleClosedSpline.curveType = 'catmullrom';
sampleClosedSpline.closed = true;

// Keep a dictionary of Curve instances
const splines = {
    GrannyKnot: new Curves.GrannyKnot(),
    HeartCurve: new Curves.HeartCurve(3.5),
    VivianiCurve: new Curves.VivianiCurve(70),
    KnotCurve: new Curves.KnotCurve(),
    HelixCurve: new Curves.HelixCurve(),
    TrefoilKnot: new Curves.TrefoilKnot(),
    TorusKnot: new Curves.TorusKnot(20),
    CinquefoilKnot: new Curves.CinquefoilKnot(20),
    TrefoilPolynomialKnot: new Curves.TrefoilPolynomialKnot(14),
    FigureEightPolynomialKnot: new Curves.FigureEightPolynomialKnot(),
    DecoratedTorusKnot4a: new Curves.DecoratedTorusKnot4a(),
    DecoratedTorusKnot4b: new Curves.DecoratedTorusKnot4b(),
    DecoratedTorusKnot5a: new Curves.DecoratedTorusKnot5a(),
    DecoratedTorusKnot5c: new Curves.DecoratedTorusKnot5c(),
    PipeSpline: pipeSpline,
    SampleClosedSpline: sampleClosedSpline
};

let parent, tubeGeometry, mesh;

// [x] GUI Params
const params = {
    spline: 'TorusKnot',
    scale: 4,
    extrusionSegments: 500,
    radiusSegments: 20,
    closed: true,
    animationView: true,
    lookAhead: false,
    cameraHelper: false,
    radius: radius,
};

//[x] shader material
const material = new THREE.ShaderMaterial({

    uniforms: {

        time: { value: 1.0 },
        basePos: { value: new THREE.Vector3() },
        linewidth: { value: grid_linewidth },
        resolution: { value: gridResolutionXY },
        color: { value: tunnel_faceColor },
        color_alpha: { type: "f", value: tunnel_faceColor_alpha },
        line_color: { value: line_color }
    },
    side: THREE.DoubleSide,
    extensions: {
        derivatives: true
    },
    opacity: 1.0,
    vertexColors: true,
    vertexShader: `
    uniform float time;
    uniform vec3 basePos;
    varying vec3 vPos;
    varying vec2 vUv;


    void main()	{
      vPos = position + basePos;
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);

    }
    `,
    fragmentShader: `
    varying vec3 vPos;
    varying vec2 vUv;
    uniform float time;
    uniform vec3 color;
    uniform float color_alpha;
    uniform vec2 linewidth;
    uniform vec2 resolution;
    uniform vec3 line_color;

    float line(float width, vec2 step){

      vec2 coord = vUv / step;
    //   coord.x += sin(coord.y - time * 5.) + time; // wavy effect + "rotation"
      vec2 grid = abs(fract(coord - 0.5) -0.5) / fwidth(coord * width);
      float l = min(grid.x, grid.y);
      return 1. - min(l, 1.0);
    }

    void main() {
        //[x] subdivisions
      float resolution_Y= resolution.y*10.0;
      float resolution_X= resolution.x / 10.0;
      float v = line(linewidth.x, vec2(1.0 / resolution_Y, resolution_X));
      float s = 500.; // step
      float mp = mod(vPos.z - time * 100., s);

      vec4 c = vec4(line_color.x,line_color.y,line_color.z,1); // mixing base colour of lines and colour of wave
      vec4 faceColor = vec4(color.x,color.y,color.z,color_alpha);
    //   vec4 faceColor = color;
      c = mix(faceColor, c, v);
      gl_FragColor = vec4(c);
    }
        `,
});

material.transparent = mat_transparency_flag;
function addTube() {

    if (mesh !== undefined) {

        parent.remove(mesh);
        mesh.geometry.dispose();

    }

    // [x] extruding
    extrudePath = splines[params.spline];

    var smooth = function (geometry) {
        let iterations = 2;
        let params_smooth = {
            split: true,       // optional, default: true
            uvSmooth: false,      // optional, default: false
            preserveEdges: false,      // optional, default: false
            flatOnly: false,      // optional, default: false
            maxTriangles: Infinity,   // optional, default: Infinity}
        };
        const result = LoopSubdivision.modify(geometry, iterations, params_smooth);
        return result
    }

    // [x] tubeGeometry
    tubeGeometry = new THREE.TubeGeometry(extrudePath, params.extrusionSegments, params.radius, params.radiusSegments, params.closed);

    addGeometry(tubeGeometry);
    // addGeometry(smooth(tubeGeometry));

    setScale();

}

function setScale() {

    mesh.scale.set(params.scale, params.scale, params.scale);

}


function addGeometry(geometry) {

    // 3D shape
    mesh = new THREE.Mesh(geometry, material);
    // const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
    // mesh.add(wireframe);

    parent.add(mesh);

}

function animateCamera() {

    cameraHelper.visible = params.cameraHelper;
    cameraEye.visible = params.cameraHelper;

}

// function changeColor() {

// }

init();
animate();

function init() {

    container = document.getElementById('container');

    // camera

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 10000);
    camera.position.set(0, 50, 500);

    // scene

    scene = new THREE.Scene();
    scene.background = bg_color;

    // light

    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(0, 0, 1);
    scene.add(light);
    // tube
    parent = new THREE.Object3D();
    scene.add(parent);

    splineCamera = new THREE.PerspectiveCamera(84, window.innerWidth / window.innerHeight, 0.01, 1000);
    parent.add(splineCamera);

    cameraHelper = new THREE.CameraHelper(splineCamera);
    scene.add(cameraHelper);

    addTube();
    // debug camera

    // setGeom(mesh, 0xFFFF, 0, 0, 0)


    cameraEye = new THREE.Mesh(new THREE.SphereGeometry(5), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
    parent.add(cameraEye);

    cameraHelper.visible = params.cameraHelper;
    cameraEye.visible = params.cameraHelper;

    // renderer

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // stats

    stats = new Stats();
    container.appendChild(stats.dom);

    // dat.GUI

    const gui = new GUI({ width: 285 });

    const folderGeometry = gui.addFolder('Geometry');

    folderGeometry.add(params, 'spline', Object.keys(splines)).onChange(function () {

        addTube();

    });
    folderGeometry.add(params, 'scale', 2, 10).step(2).onChange(function () {

        setScale();

    });
    folderGeometry.add(params, 'extrusionSegments', 50, 500).step(50).onChange(function () {

        addTube();

    });
    folderGeometry.add(params, 'radiusSegments', 2, 20).step(1).onChange(function () {

        addTube();

    });
    folderGeometry.add(params, 'closed').onChange(function () {

        addTube();

    });

    folderGeometry.open();
    const folderCamera = gui.addFolder('Camera');
    folderCamera.add(params, 'animationView').onChange(function () {

        animateCamera();

    });
    folderCamera.add(params, 'lookAhead').onChange(function () {

        animateCamera();

    });
    folderCamera.add(params, 'cameraHelper').onChange(function () {

        animateCamera();

    });
    folderCamera.open();

    // [x] folderCustom
    const folderCustom = gui.addFolder('Custom')


    folderCustom.add({ looptime: loopFactor }, "looptime", 0, 20, 1).onChange(function (newValue) {
        // someValue = THREE.MathUtils.lerp(someValue, whereTo, speed)
        loopFactor = newValue * 10000;
    });

    // folderCustom.add(params, 'radius', 1, 10).onChange(function (newValue) {
    //     radius = smoothValue(radius, newValue);
    //     addTube();
    // });
    folderCustom.add({ gridCountX: gridResolutionXY.x }, 'gridCountX', 0.01, 1.00).onChange(function (newValue) {
        gridResolutionXY.x = 1 - newValue;
    });
    folderCustom.add({ gridCountY: gridResolutionXY.y }, 'gridCountY', 0, 300, 0.1).onChange(function (newValue) {
        gridResolutionXY.y = newValue;

    });
    folderCustom.add({ grid_linewidth: grid_linewidth.x }, "grid_linewidth", 0.1, 50.00).onChange(function (newValue) {
        grid_linewidth.x = newValue;
    });

    folderCustom.addColor({ tunnelFaceColor: tunnel_faceColor }, 'tunnelFaceColor').onChange(function (newValue) {
        tunnel_faceColor = newValue;
        addTube();
    });
    folderCustom.add({ tunnel_faceColor_alpha: tunnel_faceColor_alpha }, 'tunnel_faceColor_alpha', 0, 1.00).onChange(function (newValue) {
        tunnel_faceColor_alpha = newValue;
        addTube();
    });

    folderCustom.addColor({ backgroundcolor: bg_color }, 'backgroundcolor').onChange(function (newValue) {
        bg_color = newValue;
    });
    folderCustom.addColor({ line_color: line_color }, 'line_color').onChange(function (newValue) {
        line_color = newValue;
    });



    folderCustom.open();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 100;
    controls.maxDistance = 2000;

    window.addEventListener('resize', onWindowResize);

    // const sphereGeometry = new THREE.SphereGeometry(100, 32, 32);
    // const sphereMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color("#8cb622"), wireframe: true });
    // sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    // sphere.position.set(spherePos)
    // scene.add(sphere);

}
function smoothValue(targetValue, currentValue) {
    const difference = targetValue - currentValue;
    const easing = 10// adjust the easing to control the smoothness
    currentValue += difference * easing;
    return currentValue;
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

}

function animate() {
    requestAnimationFrame(animate);
    render();
    stats.update();
}

function render() {

    // animate camera along spline

    const time = Date.now() * (loopFactor / 200000);
    // [x] hier wird die geschwindigkeit eingestellt
    // TODO make a better function to control t
    const looptime = 20000;
    //[x] t ist der kurvenparameter, der über die zeit wächst
    const t = (time % looptime) / looptime;
    // console.log(t);

    // tubeGeometry.parameters.path.getPointAt(t, position);
    extrudePath.getPointAt(t, position)
    position.multiplyScalar(params.scale);

    // interpolation

    const segments = tubeGeometry.tangents.length;
    const pickt = t * segments;
    const pick = Math.floor(pickt);
    const pickNext = (pick + 1) % segments;

    binormal.subVectors(tubeGeometry.binormals[pickNext], tubeGeometry.binormals[pick]);
    binormal.multiplyScalar(pickt - pick).add(tubeGeometry.binormals[pick]);

    tubeGeometry.parameters.path.getTangentAt(t, direction);
    // [x] offset to the camera
    const offset = 0;

    normal.copy(binormal).cross(direction);

    // we move on a offset on its binormal

    position.add(normal.clone().multiplyScalar(offset));

    spherePos = position.clone().add(normal.clone().multiplyScalar(3.0).applyAxisAngle(binormal, 20.0))
    console.log(spherePos)

    splineCamera.position.copy(position);
    cameraEye.position.copy(position);

    // using arclength for stablization in look ahead

    tubeGeometry.parameters.path.getPointAt((t + 30 / tubeGeometry.parameters.path.getLength()) % 1, lookAt);
    lookAt.multiplyScalar(params.scale);

    // camera orientation 2 - up orientation via normal

    if (!params.lookAhead) lookAt.copy(position).add(direction);
    splineCamera.matrix.lookAt(splineCamera.position, lookAt, normal);
    splineCamera.quaternion.setFromRotationMatrix(splineCamera.matrix);

    cameraHelper.update();

    renderer.render(scene, params.animationView === true ? splineCamera : camera);


}

const response = await fetch("device_mapping.json");
if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
}
//[x] loading device_mapping.json
const device_mapping = await response.json();

//TODO make it selectable
const device_name = "MPK mini 3"
getMidiAccess(device_name)

const mappedFuncs = {
    "radius": function (velocity) {
        params.radius = MathUtils.lerp(.5, velocity, 0.1)
        addTube();
    },
    "gridResolutionXY.y": function (velocity) {
        let newValue = mapVelocity(velocity, 0, 500)
        gridResolutionXY.y = MathUtils.lerp(newValue, newValue, .05);
    },
    "gridResolutionXY.x": function (velocity) {
        let newValue = mapVelocity(velocity, 5.0, 0)
        gridResolutionXY.x = MathUtils.lerp(0.05, newValue, .5)
    },
    "scale": function (velocity) {
        params.scale = velocity;
        addTube()
    }

}

function connectToDevice(device) {
    // [x] functions to controls
    console.log('Connecting to device', device);
    device.onmidimessage = function (m) {
        const [command, key, velocity] = m.data;
        let keyToTarget = getControlByKey(device_mapping, device_name, key);
        mappedFuncs[keyToTarget.target](velocity);
    }
}


function getMidiAccess(deviceName) {
    navigator.requestMIDIAccess()
        .then(function (access) {
            console.log(Array.from(access.inputs.values()))
            const device = Array.from(access.inputs.values()).filter(x => x.name == deviceName)[0];
            connectToDevice(device);
        })
}

function mapVelocity(number, newMin, newMax) {
    let result = MathUtils.mapLinear(number, 0, 127, newMin, newMax)
    console.log(result)
    return result
}


function getControlByKey(device_mapping, device_name, searchKey) {
    return device_mapping.devices[device_name].controls[searchKey]
}