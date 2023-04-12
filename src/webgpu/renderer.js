import { vs, fs } from "../shaders/renderShader.js";
import {
  bufferMap,
  retrivePoints,
  toDeleteMap,
  wait,
  controls,
  global_max_intensity,
} from "../index.js";
import Stats from "three/examples/jsm/libs/stats.module";

let adapter = null;
let device = null;
let worldViewProj = mat4.create();
var projView = mat4.create();
let proj;
let camera;
let context = null;
let swapChainFormat = "bgra8unorm";
let renderPipeline;
let mvp_BG;
let positionBuffer;
let colorBuffer;
let MVP_Buffer;
var lasInfoBuffer;
let maxIntensityBuffer;
let commandEncoder;
let renderPassDescriptor;
let renderDepthTexture;
let canvas;
let numPoints;
let positions, colors;
let keyMap = {
  isDown: false,
  dragging: false,
};
let debounceTimeOutId = null;
let colorMapBuffer;
let paramsBuffer;
let currentAxis = 2;
let param;
const stats = Stats();
let controller;
document.body.appendChild(stats.dom);
let counter = 0;

function throttle(callback, interval) {
  let enableCall = true;
  return function (...args) {
    if (!enableCall) return;
    enableCall = false;
    callback.apply(this, args);
    setTimeout(() => (enableCall = true), interval);
  };
}

let throttleTreeTravel = throttle(retrivePoints, 3000);

// ------------------------------- camera itenary

const iternary = [
  // [-30.4, 45.2, 1000],
  // [-30.4, 45.2, 385],
  // [-200, -1180, -50],
  // [-100, -800, -50],
  {
    position: [-1173, 447, 455],
    rotation: [0.36, -0.71, -2.0],
    target: [69.4, -57.989, -879.764],
  },
  {
    position: [-1172.67, -1079.21, 232],
    rotation: [0.829, -0.76, -0.5617],
    target: [138, -72.182, -699.85],
  },

  {
    position: [-99.4, -280.4, 1923.32],
    rotation: [6.84, -7.29, 0.817],
    target: [-99.4, -280, -418],
  },
  {
    position: [-317.5, -1922, 1894.75],
    rotation: [0.7862, -0.0433, 0.0418],
    target: [450.02, 208.66, -310],
  },
  {
    position: [-632, -1184.73, 285],
    rotation: [0.7216, -0.18, 0.15],
    target: [-64.53, -331.32, -367],
  },
  {
    position: [-22.63, -1385.14, 474],
    rotation: [1.039, 0.013722, 0.008],
    target: [-46.073, -86.79, -389.69],
  },
  {
    position: [1229, -1019.31, 450.9],
    rotation: [0.466, 0.66604, 0.883],
    target: [68.77, -347.65, -884],
  },
  {
    position: [1197.2, 630.5, 333.4],
    rotation: [-0.737, 0.45, 2.69],
    target: [368, -513, -925],
  },
];

function moveCamera() {
  return new Promise((resolve, reject) => {
    controls.object.position.set(
      iternary[count].x,
      iternary[count].y,
      iternary[count].z
    );
    render();
    throttleTreeTravel(projView);
    resolve("done");
  });
}

let count = 0;
function itenaryStart(fn) {
  fn().then((response) => {
    console.log("done1");
    count++;
    if (count < 5) setTimeout(() => itenaryStart(fn), 10000);
  });
}

// -----------------------------------------------------------------

function configureSwapChain(device) {
  context.configure({
    device: device,
    format: swapChainFormat,
    usage: GPUTextureUsage.RenderAttachment,
    alphaMode: "premultiplied",
  });
}

function goToFallback() {
  console.error("unable to start webgpu");
  return;
}

function recoverFromDeviceLoss(data) {
  console.log("device is lost");
}

(() => {
  const selectColormap = document.getElementById("colormap-axis");
  selectColormap.addEventListener("change", (event) => {
    const axis = parseInt(event.target.value);
    if (axis != currentAxis) {
      currentAxis = axis;
      updateAxis();
    }
  });
})();

async function updateMaxIntensity() {
  param[param.length - 1] = global_max_intensity;
  const stagingBuffer = device.createBuffer({
    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    size: 32,
    mappedAtCreation: true,
  });

  const stagingData = new Float32Array(stagingBuffer.getMappedRange());
  stagingData.set(param);
  stagingBuffer.unmap();
  const copyEncoder = device.createCommandEncoder();
  copyEncoder.copyBufferToBuffer(stagingBuffer, 28, paramsBuffer, 28, 4);
  device.queue.submit([copyEncoder.finish()]);
}

async function updateAxis() {
  param[param.length - 2] = currentAxis;
  const stagingBuffer = device.createBuffer({
    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    size: 32,
    mappedAtCreation: true,
  });

  const stagingData = new Float32Array(stagingBuffer.getMappedRange());
  stagingData.set(param);
  stagingBuffer.unmap();
  const copyEncoder = device.createCommandEncoder();
  copyEncoder.copyBufferToBuffer(stagingBuffer, 24, paramsBuffer, 24, 8);
  device.queue.submit([copyEncoder.finish()]);
}

async function init() {
  adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return goToFallback();
  device = await adapter.requestDevice();
  if (!device) return goToFallback();
  // device.lost.then(recoverFromDeviceLoss);

  canvas = document.getElementById("screen-canvas");
  context = canvas.getContext("webgpu");
  if (!context) {
    console.error("coould not get context from the canvas");
    return;
  }
  canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  canvas.height = window.innerHeight * (window.devicePixelRatio || 1);

  swapChainFormat = navigator.gpu.getPreferredCanvasFormat();
  configureSwapChain(device);
  canvas.addEventListener("mousedown", (e) => {
    if (e.buttons == 1 || e.buttons == 2) {
      keyMap["isDown"] = true;
    }
  });

  window.addEventListener("mouseup", (e) => {
    keyMap["isDown"] = false;
  });

  canvas.addEventListener("mousemove", () => {
    if (keyMap["isDown"] == true) {
      // let cameraPosition = camera.eyePos();
      controls.update();
      throttleTreeTravel(projView);
    }
  });

  window.addEventListener("wheel", (event) => {
    // console.log(camera.eyePos());
    throttleTreeTravel(projView);
  });
}

async function intRenderPipeline() {
  let Vertex_Buffer_Descriptor = [{}];
  let vs_module = device.createShaderModule({
    label: "vertex shader",
    code: vs,
  });

  let fs_module = device.createShaderModule({
    label: "fragment shader",
    code: fs,
  });

  let positionAttribute_Desc = {
    shaderLocation: 0,
    offset: 0,
    format: "float32x3",
  };

  let colorAttribute_Desc = {
    shaderLocation: 1,
    offset: 0,
    format: "float32x3",
  };

  let Vertex_Shader_Descriptor = {
    module: vs_module,
    entryPoint: "main",
    buffers: [
      {
        arrayStride: 12,
        stepMode: "instance",
        attributes: [positionAttribute_Desc],
      },
      {
        arrayStride: 12,
        stepMode: "instance",
        attributes: [colorAttribute_Desc],
      },
    ],
  };

  let Fragment_Shader_Descriptor = {
    module: fs_module,
    entryPoint: "main",
    targets: [{ format: swapChainFormat }],
  };

  let Depth_Stencil_Descriptor = {
    format: "depth24plus-stencil8",
    depthWriteEnabled: true,
    depthCompare: "less",
  };

  let Primitive_Descriptor = {
    topology: "triangle-strip",
    cullMode: "none",
  };

  renderPipeline = await device.createRenderPipeline({
    label: "render pipeline",
    layout: "auto",
    vertex: Vertex_Shader_Descriptor,
    fragment: Fragment_Shader_Descriptor,
    depthStencil: Depth_Stencil_Descriptor,
    primitive: Primitive_Descriptor,
  });
}

async function initVertexBuffer() {
  let totalNumberOfPoints = numPoints;
  positionBuffer = device.createBuffer({
    label: "vertex position buffer",
    size: totalNumberOfPoints * 12,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let mapArrayPosition = new Float32Array(positionBuffer.getMappedRange());
  mapArrayPosition.set(positions);
  positionBuffer.unmap();

  colorBuffer = device.createBuffer({
    label: "vertex color buffer",
    size: totalNumberOfPoints * 12,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let mapArrayColor = new Float32Array(colorBuffer.getMappedRange());
  mapArrayColor.set(colors);
  colorBuffer.unmap();
}

function initUniform(cam, projMatrix, params) {
  camera = cam;
  proj = projMatrix;
  param = params;
  params.push(currentAxis);
  params.push(global_max_intensity);
  // params
  paramsBuffer = device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  let mapArray_params = new Float32Array(paramsBuffer.getMappedRange());
  mapArray_params.set(params);
  paramsBuffer.unmap();

  controls.addEventListener("change", () => {
    console.log("camera position is ", controls.object.position);
    console.log("camera rotation is ", controls.object.rotation);
    console.log("camera target is ", controls.target);
  });

  function get1DArray(arr) {
    return +arr.join().split(",");
  }
  // create colormap
  let hsv_colors = [
    [0.0, 0.0, 1.0, 0.0],
    [0.0, 1.0, 0.0, 0.0],
    [1.0, 0.0, 1.0, 0.0],
    [0.0, 0.6, 1.0, 0.0],
    [0.0, 0.8, 1.0, 0.0],
    [0.2, 0.9, 0.8, 0.0],
    [0.1, 1.0, 0.6, 0.0],
    [0.1, 1.0, 0.4, 0.0],
    [0.8, 1.0, 0.1, 0.0],
    [1.0, 1.0, 0.0, 0.0],
    [1.0, 0.9, 0.0, 0.0],
    [1.0, 0.8, 0.0, 0.0],
    [1.0, 0.6, 0.0, 0.0],
    [1.0, 0.4, 0.0, 0.0],
    [1.0, 0.2, 0.0, 0.0],
    [0.9, 0.0, 0.0, 0.0],
    [0.7, 0.0, 0.0, 0.0],
    [0.5, 0.0, 0.0, 0.0],
    [0.3, 0.0, 0.0, 0.0],
    [0.1, 0.0, 0.0, 0.0],
  ];

  hsv_colors = hsv_colors.flat();
  colorMapBuffer = device.createBuffer({
    size: hsv_colors.length * 4 * 4,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });

  let mapArray = new Float32Array(colorMapBuffer.getMappedRange());

  mapArray.set(hsv_colors);
  colorMapBuffer.unmap();

  MVP_Buffer = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  let viewMatrix = camera.matrixWorldInverse.elements;
  projView = mat4.mul(projView, proj, viewMatrix);
  return projView;
}

async function createBindGroups() {
  mvp_BG = device.createBindGroup({
    label: "uniform bindgroup - rendering",
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: MVP_Buffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: colorMapBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: paramsBuffer,
        },
      },
    ],
  });
}

async function createDepthBuffer() {
  renderDepthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

async function encodedCommand() {
  // create render pass descriptor

  let colorAttachment = {
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 0.3, g: 0.5, b: 0.8, a: 1.0 },
    loadOp: "clear",
    storeOp: "store",
  };

  let depthAttachment = {
    view: renderDepthTexture.createView(),
    depthLoadOp: "clear",
    depthClearValue: 1.0,
    depthStoreOp: "store",
    stencilLoadOp: "clear",
    stencilClearValue: 0,
    stencilStoreOp: "store",
  };

  renderPassDescriptor = {
    colorAttachments: [colorAttachment],
    depthStencilAttachment: depthAttachment,
  };
}

async function update(timestamp) {
  {
    // update worldViewProj
    let proj = mat4.create();
    let view = mat4.create();
    {
      // proj
      const aspect = Math.abs(canvas.width / canvas.height);
      mat4.perspective(proj, 90, aspect, 0.1, 1000.0);
    }

    {
      // view
      let target = vec3.fromValues(2, 5, 0);
      // let r = 50;
      // let x = r * Math.sin(timestamp / 10) + target[0];
      // let y = r * Math.cos(timestamp / 10) + target[1];
      // let z = 10;

      let position = vec3.fromValues(5, 100, 100);
      let up = vec3.fromValues(0, 0, 1);
      mat4.lookAt(view, position, target, up);
    }
    const view_matrix = camera.matrixWorldInverse;
    mat4.multiply(worldViewProj, proj, view_matrix);
  }
}

async function stages(camera, proj, params) {
  await init();
  await intRenderPipeline();
  let projectionViewMatrix = await initUniform(camera, proj, params);
  return projectionViewMatrix;
}

// ---------------------------------------------------------------------------
// i guess i am not using this

async function moveFunction() {
  camera.position.set(...iternary[counter].position);
  camera.rotation.set(...iternary[counter].rotation);
  camera.updateProjectionMatrix();
  controls.target.set(...iternary[counter].target);
  controls.update();
  // controls.setAzimuthalAngle(10);
  // controls.update();
  console.log("--------------- for step--------------", counter);
  const start = performance.now();
  await retrivePoints(projView, controls);
  const end = performance.now();
  console.log(`Total retrive Time: ${end - start}ms`);
  console.log("---------------------- I am called --------------");
  render();
}

async function moveOnInterval() {
  while (counter < iternary.length) {
    await moveFunction();
    counter++;
    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (counter == iternary.length) {
      camera.position.set(...iternary[0].position);
      camera.rotation.set(...iternary[0].rotation);
      camera.updateProjectionMatrix();
      controls.target.set(...iternary[0].target);
      controls.update();
    }
  }
}
async function renderStages(position, color) {
  console.log(" i am insider another render");
  numPoints = position.length / 3;
  positions = position;
  colors = color;
  await initVertexBuffer();
  await createBindGroups();
  await createDepthBuffer();
  requestAnimationFrame(render2);
}
// -----------------------------------------------------------------------------
async function renderWrapper() {
  await createBindGroups();
  await createDepthBuffer();
  await updateMaxIntensity();
  render();
  // await retrivePoints(projView, controls);
  render();
  // camera.position.set(...iternary[0].position);
  // camera.rotation.set(...iternary[0].rotation);
  camera.updateProjectionMatrix();
  // controls.target.set(...iternary[0].target);
  controls.update();
  // await moveOnInterval();

  // itenaryStart(moveCamera);
}

function render(timestamp) {
  stats.update();
  var startTime = performance.now();
  commandEncoder = device.createCommandEncoder();
  //  this is not helpful for tree traversal so model matrix rotation is removed for now
  let viewMatrix = camera.matrixWorldInverse.elements;
  projView = mat4.mul(projView, proj, viewMatrix);
  // update(timestamp);
  encodedCommand();

  // device.queue.writeBuffer(MVP_Buffer, 0, worldViewProj, 16);

  let wvStagingBuffer = device.createBuffer({
    size: 4 * 16,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  const stagingUniformData = new Float32Array(wvStagingBuffer.getMappedRange());
  stagingUniformData.set(projView);
  wvStagingBuffer.unmap();
  commandEncoder.copyBufferToBuffer(wvStagingBuffer, 0, MVP_Buffer, 0, 64);
  let renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
  renderPass.setPipeline(renderPipeline);
  renderPass.setViewport(0, 0, canvas.width, canvas.height, 0.0, 1.0);
  renderPass.setBindGroup(0, mvp_BG);
  for (let key in bufferMap) {
    renderPass.setVertexBuffer(0, bufferMap[key].position);
    renderPass.setVertexBuffer(1, bufferMap[key].color);
    // console.log("length is", +bufferMap[key].position.label / 3);
    numPoints = +bufferMap[key].position.label / 3;
    renderPass.draw(4, numPoints, 0, 0);
  }
  controls.update();
  renderPass.end();
  device.queue.submit([commandEncoder.finish()]);
  var endTime = performance.now();
  requestAnimationFrame(render);
}

export { renderStages, device, stages, renderWrapper, throttle };
