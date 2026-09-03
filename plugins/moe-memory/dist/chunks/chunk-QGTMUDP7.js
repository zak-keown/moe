// @generated — do not edit; see scripts/build-runtime.mjs
import { createRequire as __createRequire } from 'module';
const require = __createRequire(import.meta.url);
import {
  acquireFileLock,
  getDefaultPackageRoot,
  releaseFileLock
} from "./chunk-LUAEQ7DI.js";
import {
  getModelCacheDir
} from "./chunk-YFLZKW2J.js";

// src/embeddings.ts
import fs5 from "node:fs";
import path3 from "node:path";

// src/embedding-runtime.ts
import fs2 from "node:fs";

// ../../node_modules/.pnpm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/node_modules/onnxruntime-web/dist/ort.node.min.mjs
import { createRequire } from "module";

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/backend-impl.js
var backends = /* @__PURE__ */ new Map();
var backendsSortedByPriority = [];
var registerBackend = (name, backend2, priority) => {
  if (backend2 && typeof backend2.init === "function" && typeof backend2.createInferenceSessionHandler === "function") {
    const currentBackend = backends.get(name);
    if (currentBackend === void 0) {
      backends.set(name, { backend: backend2, priority });
    } else if (currentBackend.priority > priority) {
      return;
    } else if (currentBackend.priority === priority) {
      if (currentBackend.backend !== backend2) {
        throw new Error(`cannot register backend "${name}" using priority ${priority}`);
      }
    }
    if (priority >= 0) {
      const i = backendsSortedByPriority.indexOf(name);
      if (i !== -1) {
        backendsSortedByPriority.splice(i, 1);
      }
      for (let i2 = 0; i2 < backendsSortedByPriority.length; i2++) {
        if (backends.get(backendsSortedByPriority[i2]).priority <= priority) {
          backendsSortedByPriority.splice(i2, 0, name);
          return;
        }
      }
      backendsSortedByPriority.push(name);
    }
    return;
  }
  throw new TypeError("not a valid backend");
};
var tryResolveAndInitializeBackend = async (backendName) => {
  const backendInfo = backends.get(backendName);
  if (!backendInfo) {
    return "backend not found.";
  }
  if (backendInfo.initialized) {
    return backendInfo.backend;
  } else if (backendInfo.aborted) {
    return backendInfo.error;
  } else {
    const isInitializing = !!backendInfo.initPromise;
    try {
      if (!isInitializing) {
        backendInfo.initPromise = backendInfo.backend.init(backendName);
      }
      await backendInfo.initPromise;
      backendInfo.initialized = true;
      return backendInfo.backend;
    } catch (e) {
      if (!isInitializing) {
        backendInfo.error = `${e}`;
        backendInfo.aborted = true;
      }
      return backendInfo.error;
    } finally {
      delete backendInfo.initPromise;
    }
  }
};
var resolveBackendAndExecutionProviders = async (options) => {
  const eps = options.executionProviders || [];
  const backendHints = eps.map((i) => typeof i === "string" ? i : i.name);
  const backendNames = backendHints.length === 0 ? backendsSortedByPriority : backendHints;
  let backend2;
  const errors = [];
  const availableBackendNames = /* @__PURE__ */ new Set();
  for (const backendName of backendNames) {
    const resolveResult = await tryResolveAndInitializeBackend(backendName);
    if (typeof resolveResult === "string") {
      errors.push({ name: backendName, err: resolveResult });
    } else {
      if (!backend2) {
        backend2 = resolveResult;
      }
      if (backend2 === resolveResult) {
        availableBackendNames.add(backendName);
      }
    }
  }
  if (!backend2) {
    throw new Error(`no available backend found. ERR: ${errors.map((e) => `[${e.name}] ${e.err}`).join(", ")}`);
  }
  for (const { name, err } of errors) {
    if (backendHints.includes(name)) {
      console.warn(`removing requested execution provider "${name}" from session options because it is not available: ${err}`);
    }
  }
  const filteredEps = eps.filter((i) => availableBackendNames.has(typeof i === "string" ? i : i.name));
  return [
    backend2,
    new Proxy(options, {
      get: (target, prop) => {
        if (prop === "executionProviders") {
          return filteredEps;
        }
        return Reflect.get(target, prop);
      }
    })
  ];
};

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/version.js
var version = "1.24.0-dev.20251116-b39e144322";

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/env-impl.js
var logLevelValue = "warning";
var env = {
  wasm: {},
  webgl: {},
  webgpu: {},
  versions: { common: version },
  set logLevel(value) {
    if (value === void 0) {
      return;
    }
    if (typeof value !== "string" || ["verbose", "info", "warning", "error", "fatal"].indexOf(value) === -1) {
      throw new Error(`Unsupported logging level: ${value}`);
    }
    logLevelValue = value;
  },
  get logLevel() {
    return logLevelValue;
  }
};
Object.defineProperty(env, "logLevel", { enumerable: true });

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/env.js
var env2 = env;

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/tensor-conversion-impl.js
var tensorToDataURL = (tensor, options) => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(1, 1);
  canvas.width = tensor.dims[3];
  canvas.height = tensor.dims[2];
  const pixels2DContext = canvas.getContext("2d");
  if (pixels2DContext != null) {
    let width;
    let height;
    if (options?.tensorLayout !== void 0 && options.tensorLayout === "NHWC") {
      width = tensor.dims[2];
      height = tensor.dims[3];
    } else {
      width = tensor.dims[3];
      height = tensor.dims[2];
    }
    const inputformat = options?.format !== void 0 ? options.format : "RGB";
    const norm = options?.norm;
    let normMean;
    let normBias;
    if (norm === void 0 || norm.mean === void 0) {
      normMean = [255, 255, 255, 255];
    } else {
      if (typeof norm.mean === "number") {
        normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
      } else {
        normMean = [norm.mean[0], norm.mean[1], norm.mean[2], 0];
        if (norm.mean[3] !== void 0) {
          normMean[3] = norm.mean[3];
        }
      }
    }
    if (norm === void 0 || norm.bias === void 0) {
      normBias = [0, 0, 0, 0];
    } else {
      if (typeof norm.bias === "number") {
        normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
      } else {
        normBias = [norm.bias[0], norm.bias[1], norm.bias[2], 0];
        if (norm.bias[3] !== void 0) {
          normBias[3] = norm.bias[3];
        }
      }
    }
    const stride = height * width;
    let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
    if (inputformat === "RGBA") {
      rTensorPointer = 0;
      gTensorPointer = stride;
      bTensorPointer = stride * 2;
      aTensorPointer = stride * 3;
    } else if (inputformat === "RGB") {
      rTensorPointer = 0;
      gTensorPointer = stride;
      bTensorPointer = stride * 2;
    } else if (inputformat === "RBG") {
      rTensorPointer = 0;
      bTensorPointer = stride;
      gTensorPointer = stride * 2;
    }
    for (let i = 0; i < height; i++) {
      for (let j2 = 0; j2 < width; j2++) {
        const R = (tensor.data[rTensorPointer++] - normBias[0]) * normMean[0];
        const G = (tensor.data[gTensorPointer++] - normBias[1]) * normMean[1];
        const B = (tensor.data[bTensorPointer++] - normBias[2]) * normMean[2];
        const A2 = aTensorPointer === -1 ? 255 : (tensor.data[aTensorPointer++] - normBias[3]) * normMean[3];
        pixels2DContext.fillStyle = "rgba(" + R + "," + G + "," + B + "," + A2 + ")";
        pixels2DContext.fillRect(j2, i, 1, 1);
      }
    }
    if ("toDataURL" in canvas) {
      return canvas.toDataURL();
    } else {
      throw new Error("toDataURL is not supported");
    }
  } else {
    throw new Error("Can not access image data");
  }
};
var tensorToImageData = (tensor, options) => {
  const pixels2DContext = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : new OffscreenCanvas(1, 1).getContext("2d");
  let image;
  if (pixels2DContext != null) {
    let width;
    let height;
    let channels;
    if (options?.tensorLayout !== void 0 && options.tensorLayout === "NHWC") {
      width = tensor.dims[2];
      height = tensor.dims[1];
      channels = tensor.dims[3];
    } else {
      width = tensor.dims[3];
      height = tensor.dims[2];
      channels = tensor.dims[1];
    }
    const inputformat = options !== void 0 ? options.format !== void 0 ? options.format : "RGB" : "RGB";
    const norm = options?.norm;
    let normMean;
    let normBias;
    if (norm === void 0 || norm.mean === void 0) {
      normMean = [255, 255, 255, 255];
    } else {
      if (typeof norm.mean === "number") {
        normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
      } else {
        normMean = [norm.mean[0], norm.mean[1], norm.mean[2], 255];
        if (norm.mean[3] !== void 0) {
          normMean[3] = norm.mean[3];
        }
      }
    }
    if (norm === void 0 || norm.bias === void 0) {
      normBias = [0, 0, 0, 0];
    } else {
      if (typeof norm.bias === "number") {
        normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
      } else {
        normBias = [norm.bias[0], norm.bias[1], norm.bias[2], 0];
        if (norm.bias[3] !== void 0) {
          normBias[3] = norm.bias[3];
        }
      }
    }
    const stride = height * width;
    if (options !== void 0) {
      if (options.format !== void 0 && channels === 4 && options.format !== "RGBA" || channels === 3 && options.format !== "RGB" && options.format !== "BGR") {
        throw new Error("Tensor format doesn't match input tensor dims");
      }
    }
    const step = 4;
    let rImagePointer = 0, gImagePointer = 1, bImagePointer = 2, aImagePointer = 3;
    let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
    if (inputformat === "RGBA") {
      rTensorPointer = 0;
      gTensorPointer = stride;
      bTensorPointer = stride * 2;
      aTensorPointer = stride * 3;
    } else if (inputformat === "RGB") {
      rTensorPointer = 0;
      gTensorPointer = stride;
      bTensorPointer = stride * 2;
    } else if (inputformat === "RBG") {
      rTensorPointer = 0;
      bTensorPointer = stride;
      gTensorPointer = stride * 2;
    }
    image = pixels2DContext.createImageData(width, height);
    for (let i = 0; i < height * width; rImagePointer += step, gImagePointer += step, bImagePointer += step, aImagePointer += step, i++) {
      image.data[rImagePointer] = (tensor.data[rTensorPointer++] - normBias[0]) * normMean[0];
      image.data[gImagePointer] = (tensor.data[gTensorPointer++] - normBias[1]) * normMean[1];
      image.data[bImagePointer] = (tensor.data[bTensorPointer++] - normBias[2]) * normMean[2];
      image.data[aImagePointer] = aTensorPointer === -1 ? 255 : (tensor.data[aTensorPointer++] - normBias[3]) * normMean[3];
    }
  } else {
    throw new Error("Can not access image data");
  }
  return image;
};

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/tensor-factory-impl.js
var bufferToTensor = (buffer, options) => {
  if (buffer === void 0) {
    throw new Error("Image buffer must be defined");
  }
  if (options.height === void 0 || options.width === void 0) {
    throw new Error("Image height and width must be defined");
  }
  if (options.tensorLayout === "NHWC") {
    throw new Error("NHWC Tensor layout is not supported yet");
  }
  const { height, width } = options;
  const norm = options.norm ?? { mean: 255, bias: 0 };
  let normMean;
  let normBias;
  if (typeof norm.mean === "number") {
    normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
  } else {
    normMean = [norm.mean[0], norm.mean[1], norm.mean[2], norm.mean[3] ?? 255];
  }
  if (typeof norm.bias === "number") {
    normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
  } else {
    normBias = [norm.bias[0], norm.bias[1], norm.bias[2], norm.bias[3] ?? 0];
  }
  const inputformat = options.format !== void 0 ? options.format : "RGBA";
  const outputformat = options.tensorFormat !== void 0 ? options.tensorFormat !== void 0 ? options.tensorFormat : "RGB" : "RGB";
  const stride = height * width;
  const float32Data = outputformat === "RGBA" ? new Float32Array(stride * 4) : new Float32Array(stride * 3);
  let step = 4, rImagePointer = 0, gImagePointer = 1, bImagePointer = 2, aImagePointer = 3;
  let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
  if (inputformat === "RGB") {
    step = 3;
    rImagePointer = 0;
    gImagePointer = 1;
    bImagePointer = 2;
    aImagePointer = -1;
  }
  if (outputformat === "RGBA") {
    aTensorPointer = stride * 3;
  } else if (outputformat === "RBG") {
    rTensorPointer = 0;
    bTensorPointer = stride;
    gTensorPointer = stride * 2;
  } else if (outputformat === "BGR") {
    bTensorPointer = 0;
    gTensorPointer = stride;
    rTensorPointer = stride * 2;
  }
  for (let i = 0; i < stride; i++, rImagePointer += step, bImagePointer += step, gImagePointer += step, aImagePointer += step) {
    float32Data[rTensorPointer++] = (buffer[rImagePointer] + normBias[0]) / normMean[0];
    float32Data[gTensorPointer++] = (buffer[gImagePointer] + normBias[1]) / normMean[1];
    float32Data[bTensorPointer++] = (buffer[bImagePointer] + normBias[2]) / normMean[2];
    if (aTensorPointer !== -1 && aImagePointer !== -1) {
      float32Data[aTensorPointer++] = (buffer[aImagePointer] + normBias[3]) / normMean[3];
    }
  }
  const outputTensor = outputformat === "RGBA" ? new Tensor("float32", float32Data, [1, 4, height, width]) : new Tensor("float32", float32Data, [1, 3, height, width]);
  return outputTensor;
};
var tensorFromImage = async (image, options) => {
  const isHTMLImageEle = typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement;
  const isImageDataEle = typeof ImageData !== "undefined" && image instanceof ImageData;
  const isImageBitmap = typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap;
  const isString = typeof image === "string";
  let data;
  let bufferToTensorOptions = options ?? {};
  const createCanvas = () => {
    if (typeof document !== "undefined") {
      return document.createElement("canvas");
    } else if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(1, 1);
    } else {
      throw new Error("Canvas is not supported");
    }
  };
  const createCanvasContext = (canvas) => {
    if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
      return canvas.getContext("2d");
    } else if (canvas instanceof OffscreenCanvas) {
      return canvas.getContext("2d");
    } else {
      return null;
    }
  };
  if (isHTMLImageEle) {
    const canvas = createCanvas();
    canvas.width = image.width;
    canvas.height = image.height;
    const pixels2DContext = createCanvasContext(canvas);
    if (pixels2DContext != null) {
      let height = image.height;
      let width = image.width;
      if (options !== void 0 && options.resizedHeight !== void 0 && options.resizedWidth !== void 0) {
        height = options.resizedHeight;
        width = options.resizedWidth;
      }
      if (options !== void 0) {
        bufferToTensorOptions = options;
        if (options.tensorFormat !== void 0) {
          throw new Error("Image input config format must be RGBA for HTMLImageElement");
        } else {
          bufferToTensorOptions.tensorFormat = "RGBA";
        }
        bufferToTensorOptions.height = height;
        bufferToTensorOptions.width = width;
      } else {
        bufferToTensorOptions.tensorFormat = "RGBA";
        bufferToTensorOptions.height = height;
        bufferToTensorOptions.width = width;
      }
      pixels2DContext.drawImage(image, 0, 0);
      data = pixels2DContext.getImageData(0, 0, width, height).data;
    } else {
      throw new Error("Can not access image data");
    }
  } else if (isImageDataEle) {
    let height;
    let width;
    if (options !== void 0 && options.resizedWidth !== void 0 && options.resizedHeight !== void 0) {
      height = options.resizedHeight;
      width = options.resizedWidth;
    } else {
      height = image.height;
      width = image.width;
    }
    if (options !== void 0) {
      bufferToTensorOptions = options;
    }
    bufferToTensorOptions.format = "RGBA";
    bufferToTensorOptions.height = height;
    bufferToTensorOptions.width = width;
    if (options !== void 0) {
      const tempCanvas = createCanvas();
      tempCanvas.width = width;
      tempCanvas.height = height;
      const pixels2DContext = createCanvasContext(tempCanvas);
      if (pixels2DContext != null) {
        pixels2DContext.putImageData(image, 0, 0);
        data = pixels2DContext.getImageData(0, 0, width, height).data;
      } else {
        throw new Error("Can not access image data");
      }
    } else {
      data = image.data;
    }
  } else if (isImageBitmap) {
    if (options === void 0) {
      throw new Error("Please provide image config with format for Imagebitmap");
    }
    const canvas = createCanvas();
    canvas.width = image.width;
    canvas.height = image.height;
    const pixels2DContext = createCanvasContext(canvas);
    if (pixels2DContext != null) {
      const height = image.height;
      const width = image.width;
      pixels2DContext.drawImage(image, 0, 0, width, height);
      data = pixels2DContext.getImageData(0, 0, width, height).data;
      bufferToTensorOptions.height = height;
      bufferToTensorOptions.width = width;
      return bufferToTensor(data, bufferToTensorOptions);
    } else {
      throw new Error("Can not access image data");
    }
  } else if (isString) {
    return new Promise((resolve, reject) => {
      const canvas = createCanvas();
      const context = createCanvasContext(canvas);
      if (!image || !context) {
        return reject();
      }
      const newImage = new Image();
      newImage.crossOrigin = "Anonymous";
      newImage.src = image;
      newImage.onload = () => {
        canvas.width = newImage.width;
        canvas.height = newImage.height;
        context.drawImage(newImage, 0, 0, canvas.width, canvas.height);
        const img = context.getImageData(0, 0, canvas.width, canvas.height);
        bufferToTensorOptions.height = canvas.height;
        bufferToTensorOptions.width = canvas.width;
        resolve(bufferToTensor(img.data, bufferToTensorOptions));
      };
    });
  } else {
    throw new Error("Input data provided is not supported - aborted tensor creation");
  }
  if (data !== void 0) {
    return bufferToTensor(data, bufferToTensorOptions);
  } else {
    throw new Error("Input data provided is not supported - aborted tensor creation");
  }
};
var tensorFromTexture = (texture, options) => {
  const { width, height, download, dispose } = options;
  const dims = [1, height, width, 4];
  return new Tensor({ location: "texture", type: "float32", texture, dims, download, dispose });
};
var tensorFromGpuBuffer = (gpuBuffer, options) => {
  const { dataType, dims, download, dispose } = options;
  return new Tensor({ location: "gpu-buffer", type: dataType ?? "float32", gpuBuffer, dims, download, dispose });
};
var tensorFromMLTensor = (mlTensor, options) => {
  const { dataType, dims, download, dispose } = options;
  return new Tensor({ location: "ml-tensor", type: dataType ?? "float32", mlTensor, dims, download, dispose });
};
var tensorFromPinnedBuffer = (type, buffer, dims) => new Tensor({ location: "cpu-pinned", type, data: buffer, dims: dims ?? [buffer.length] });

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/tensor-impl-type-mapping.js
var NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP = /* @__PURE__ */ new Map([
  ["float32", Float32Array],
  ["uint8", Uint8Array],
  ["int8", Int8Array],
  ["uint16", Uint16Array],
  ["int16", Int16Array],
  ["int32", Int32Array],
  ["bool", Uint8Array],
  ["float64", Float64Array],
  ["uint32", Uint32Array],
  ["int4", Uint8Array],
  ["uint4", Uint8Array]
]);
var NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP = /* @__PURE__ */ new Map([
  [Float32Array, "float32"],
  [Uint8Array, "uint8"],
  [Int8Array, "int8"],
  [Uint16Array, "uint16"],
  [Int16Array, "int16"],
  [Int32Array, "int32"],
  [Float64Array, "float64"],
  [Uint32Array, "uint32"]
]);
var isTypedArrayChecked = false;
var checkTypedArray = () => {
  if (!isTypedArrayChecked) {
    isTypedArrayChecked = true;
    const isBigInt64ArrayAvailable = typeof BigInt64Array !== "undefined" && BigInt64Array.from;
    const isBigUint64ArrayAvailable = typeof BigUint64Array !== "undefined" && BigUint64Array.from;
    const Float16Array2 = globalThis.Float16Array;
    const isFloat16ArrayAvailable = typeof Float16Array2 !== "undefined" && Float16Array2.from;
    if (isBigInt64ArrayAvailable) {
      NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("int64", BigInt64Array);
      NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.set(BigInt64Array, "int64");
    }
    if (isBigUint64ArrayAvailable) {
      NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("uint64", BigUint64Array);
      NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.set(BigUint64Array, "uint64");
    }
    if (isFloat16ArrayAvailable) {
      NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("float16", Float16Array2);
      NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.set(Float16Array2, "float16");
    } else {
      NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("float16", Uint16Array);
    }
  }
};

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/tensor-utils-impl.js
var calculateSize = (dims) => {
  let size = 1;
  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i];
    if (typeof dim !== "number" || !Number.isSafeInteger(dim)) {
      throw new TypeError(`dims[${i}] must be an integer, got: ${dim}`);
    }
    if (dim < 0) {
      throw new RangeError(`dims[${i}] must be a non-negative integer, got: ${dim}`);
    }
    size *= dim;
  }
  return size;
};
var tensorReshape = (tensor, dims) => {
  switch (tensor.location) {
    case "cpu":
      return new Tensor(tensor.type, tensor.data, dims);
    case "cpu-pinned":
      return new Tensor({
        location: "cpu-pinned",
        data: tensor.data,
        type: tensor.type,
        dims
      });
    case "texture":
      return new Tensor({
        location: "texture",
        texture: tensor.texture,
        type: tensor.type,
        dims
      });
    case "gpu-buffer":
      return new Tensor({
        location: "gpu-buffer",
        gpuBuffer: tensor.gpuBuffer,
        type: tensor.type,
        dims
      });
    case "ml-tensor":
      return new Tensor({
        location: "ml-tensor",
        mlTensor: tensor.mlTensor,
        type: tensor.type,
        dims
      });
    default:
      throw new Error(`tensorReshape: tensor location ${tensor.location} is not supported`);
  }
};

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/tensor-impl.js
var Tensor = class {
  /**
   * implementation.
   */
  constructor(arg0, arg1, arg2) {
    checkTypedArray();
    let type;
    let dims;
    if (typeof arg0 === "object" && "location" in arg0) {
      this.dataLocation = arg0.location;
      type = arg0.type;
      dims = arg0.dims;
      switch (arg0.location) {
        case "cpu-pinned": {
          const expectedTypedArrayConstructor = NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.get(type);
          if (!expectedTypedArrayConstructor) {
            throw new TypeError(`unsupported type "${type}" to create tensor from pinned buffer`);
          }
          if (!(arg0.data instanceof expectedTypedArrayConstructor)) {
            throw new TypeError(`buffer should be of type ${expectedTypedArrayConstructor.name}`);
          }
          this.cpuData = arg0.data;
          break;
        }
        case "texture": {
          if (type !== "float32") {
            throw new TypeError(`unsupported type "${type}" to create tensor from texture`);
          }
          this.gpuTextureData = arg0.texture;
          this.downloader = arg0.download;
          this.disposer = arg0.dispose;
          break;
        }
        case "gpu-buffer": {
          if (type !== "float32" && type !== "float16" && type !== "int32" && type !== "int64" && type !== "uint32" && type !== "uint8" && type !== "bool" && type !== "uint4" && type !== "int4") {
            throw new TypeError(`unsupported type "${type}" to create tensor from gpu buffer`);
          }
          this.gpuBufferData = arg0.gpuBuffer;
          this.downloader = arg0.download;
          this.disposer = arg0.dispose;
          break;
        }
        case "ml-tensor": {
          if (type !== "float32" && type !== "float16" && type !== "int32" && type !== "int64" && type !== "uint32" && type !== "uint64" && type !== "int8" && type !== "uint8" && type !== "bool" && type !== "uint4" && type !== "int4") {
            throw new TypeError(`unsupported type "${type}" to create tensor from MLTensor`);
          }
          this.mlTensorData = arg0.mlTensor;
          this.downloader = arg0.download;
          this.disposer = arg0.dispose;
          break;
        }
        default:
          throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`);
      }
    } else {
      let data;
      let maybeDims;
      if (typeof arg0 === "string") {
        type = arg0;
        maybeDims = arg2;
        if (arg0 === "string") {
          if (!Array.isArray(arg1)) {
            throw new TypeError("A string tensor's data must be a string array.");
          }
          data = arg1;
        } else {
          const typedArrayConstructor = NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.get(arg0);
          if (typedArrayConstructor === void 0) {
            throw new TypeError(`Unsupported tensor type: ${arg0}.`);
          }
          if (Array.isArray(arg1)) {
            if (arg0 === "float16" && typedArrayConstructor === Uint16Array || arg0 === "uint4" || arg0 === "int4") {
              throw new TypeError(`Creating a ${arg0} tensor from number array is not supported. Please use ${typedArrayConstructor.name} as data.`);
            } else if (arg0 === "uint64" || arg0 === "int64") {
              data = typedArrayConstructor.from(arg1, BigInt);
            } else {
              data = typedArrayConstructor.from(arg1);
            }
          } else if (arg1 instanceof typedArrayConstructor) {
            data = arg1;
          } else if (arg1 instanceof Uint8ClampedArray) {
            if (arg0 === "uint8") {
              data = Uint8Array.from(arg1);
            } else {
              throw new TypeError(`A Uint8ClampedArray tensor's data must be type of uint8`);
            }
          } else if (arg0 === "float16" && arg1 instanceof Uint16Array && typedArrayConstructor !== Uint16Array) {
            data = new globalThis.Float16Array(arg1.buffer, arg1.byteOffset, arg1.length);
          } else {
            throw new TypeError(`A ${type} tensor's data must be type of ${typedArrayConstructor}`);
          }
        }
      } else {
        maybeDims = arg1;
        if (Array.isArray(arg0)) {
          if (arg0.length === 0) {
            throw new TypeError("Tensor type cannot be inferred from an empty array.");
          }
          const firstElementType = typeof arg0[0];
          if (firstElementType === "string") {
            type = "string";
            data = arg0;
          } else if (firstElementType === "boolean") {
            type = "bool";
            data = Uint8Array.from(arg0);
          } else {
            throw new TypeError(`Invalid element type of data array: ${firstElementType}.`);
          }
        } else if (arg0 instanceof Uint8ClampedArray) {
          type = "uint8";
          data = Uint8Array.from(arg0);
        } else {
          const mappedType = NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.get(arg0.constructor);
          if (mappedType === void 0) {
            throw new TypeError(`Unsupported type for tensor data: ${arg0.constructor}.`);
          }
          type = mappedType;
          data = arg0;
        }
      }
      if (maybeDims === void 0) {
        maybeDims = [data.length];
      } else if (!Array.isArray(maybeDims)) {
        throw new TypeError("A tensor's dims must be a number array");
      }
      dims = maybeDims;
      this.cpuData = data;
      this.dataLocation = "cpu";
    }
    const size = calculateSize(dims);
    if (this.cpuData && size !== this.cpuData.length) {
      if ((type === "uint4" || type === "int4") && Math.ceil(size / 2) === this.cpuData.length) {
      } else {
        throw new Error(`Tensor's size(${size}) does not match data length(${this.cpuData.length}).`);
      }
    }
    this.type = type;
    this.dims = dims;
    this.size = size;
  }
  // #endregion
  // #region factory
  static async fromImage(image, options) {
    return tensorFromImage(image, options);
  }
  static fromTexture(texture, options) {
    return tensorFromTexture(texture, options);
  }
  static fromGpuBuffer(gpuBuffer, options) {
    return tensorFromGpuBuffer(gpuBuffer, options);
  }
  static fromMLTensor(mlTensor, options) {
    return tensorFromMLTensor(mlTensor, options);
  }
  static fromPinnedBuffer(type, buffer, dims) {
    return tensorFromPinnedBuffer(type, buffer, dims);
  }
  // #endregion
  // #region conversions
  toDataURL(options) {
    return tensorToDataURL(this, options);
  }
  toImageData(options) {
    return tensorToImageData(this, options);
  }
  // #endregion
  // #region properties
  get data() {
    this.ensureValid();
    if (!this.cpuData) {
      throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");
    }
    return this.cpuData;
  }
  get location() {
    return this.dataLocation;
  }
  get texture() {
    this.ensureValid();
    if (!this.gpuTextureData) {
      throw new Error("The data is not stored as a WebGL texture.");
    }
    return this.gpuTextureData;
  }
  get gpuBuffer() {
    this.ensureValid();
    if (!this.gpuBufferData) {
      throw new Error("The data is not stored as a WebGPU buffer.");
    }
    return this.gpuBufferData;
  }
  get mlTensor() {
    this.ensureValid();
    if (!this.mlTensorData) {
      throw new Error("The data is not stored as a WebNN MLTensor.");
    }
    return this.mlTensorData;
  }
  // #endregion
  // #region methods
  async getData(releaseData) {
    this.ensureValid();
    switch (this.dataLocation) {
      case "cpu":
      case "cpu-pinned":
        return this.data;
      case "texture":
      case "gpu-buffer":
      case "ml-tensor": {
        if (!this.downloader) {
          throw new Error("The current tensor is not created with a specified data downloader.");
        }
        if (this.isDownloading) {
          throw new Error("The current tensor is being downloaded.");
        }
        try {
          this.isDownloading = true;
          const data = await this.downloader();
          this.downloader = void 0;
          this.dataLocation = "cpu";
          this.cpuData = data;
          if (releaseData && this.disposer) {
            this.disposer();
            this.disposer = void 0;
          }
          return data;
        } finally {
          this.isDownloading = false;
        }
      }
      default:
        throw new Error(`cannot get data from location: ${this.dataLocation}`);
    }
  }
  dispose() {
    if (this.isDownloading) {
      throw new Error("The current tensor is being downloaded.");
    }
    if (this.disposer) {
      this.disposer();
      this.disposer = void 0;
    }
    this.cpuData = void 0;
    this.gpuTextureData = void 0;
    this.gpuBufferData = void 0;
    this.mlTensorData = void 0;
    this.downloader = void 0;
    this.isDownloading = void 0;
    this.dataLocation = "none";
  }
  // #endregion
  // #region tensor utilities
  ensureValid() {
    if (this.dataLocation === "none") {
      throw new Error("The tensor is disposed.");
    }
  }
  reshape(dims) {
    this.ensureValid();
    if (this.downloader || this.disposer) {
      throw new Error("Cannot reshape a tensor that owns GPU resource.");
    }
    return tensorReshape(this, dims);
  }
};

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/tensor.js
var Tensor2 = Tensor;

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/trace.js
var TRACE = (deviceType, label) => {
  if (typeof env.trace === "undefined" ? !env.wasm.trace : !env.trace) {
    return;
  }
  console.timeStamp(`${deviceType}::ORT::${label}`);
};
var TRACE_FUNC = (msg, extraMsg) => {
  const stack = new Error().stack?.split(/\r\n|\r|\n/g) || [];
  let hasTraceFunc = false;
  for (let i = 0; i < stack.length; i++) {
    if (hasTraceFunc && !stack[i].includes("TRACE_FUNC")) {
      let label = `FUNC_${msg}::${stack[i].trim().split(" ")[1]}`;
      if (extraMsg) {
        label += `::${extraMsg}`;
      }
      TRACE("CPU", label);
      return;
    }
    if (stack[i].includes("TRACE_FUNC")) {
      hasTraceFunc = true;
    }
  }
};
var TRACE_FUNC_BEGIN = (extraMsg) => {
  if (typeof env.trace === "undefined" ? !env.wasm.trace : !env.trace) {
    return;
  }
  TRACE_FUNC("BEGIN", extraMsg);
};
var TRACE_FUNC_END = (extraMsg) => {
  if (typeof env.trace === "undefined" ? !env.wasm.trace : !env.trace) {
    return;
  }
  TRACE_FUNC("END", extraMsg);
};
var TRACE_EVENT_BEGIN = (extraMsg) => {
  if (typeof env.trace === "undefined" ? !env.wasm.trace : !env.trace) {
    return;
  }
  console.time(`ORT::${extraMsg}`);
};
var TRACE_EVENT_END = (extraMsg) => {
  if (typeof env.trace === "undefined" ? !env.wasm.trace : !env.trace) {
    return;
  }
  console.timeEnd(`ORT::${extraMsg}`);
};

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/inference-session-impl.js
var InferenceSession = class _InferenceSession {
  constructor(handler) {
    this.handler = handler;
  }
  async run(feeds, arg1, arg2) {
    TRACE_FUNC_BEGIN();
    TRACE_EVENT_BEGIN("InferenceSession.run");
    const fetches = {};
    let options = {};
    if (typeof feeds !== "object" || feeds === null || feeds instanceof Tensor2 || Array.isArray(feeds)) {
      throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");
    }
    let isFetchesEmpty = true;
    if (typeof arg1 === "object") {
      if (arg1 === null) {
        throw new TypeError("Unexpected argument[1]: cannot be null.");
      }
      if (arg1 instanceof Tensor2) {
        throw new TypeError("'fetches' cannot be a Tensor");
      }
      if (Array.isArray(arg1)) {
        if (arg1.length === 0) {
          throw new TypeError("'fetches' cannot be an empty array.");
        }
        isFetchesEmpty = false;
        for (const name of arg1) {
          if (typeof name !== "string") {
            throw new TypeError("'fetches' must be a string array or an object.");
          }
          if (this.outputNames.indexOf(name) === -1) {
            throw new RangeError(`'fetches' contains invalid output name: ${name}.`);
          }
          fetches[name] = null;
        }
        if (typeof arg2 === "object" && arg2 !== null) {
          options = arg2;
        } else if (typeof arg2 !== "undefined") {
          throw new TypeError("'options' must be an object.");
        }
      } else {
        let isFetches = false;
        const arg1Keys = Object.getOwnPropertyNames(arg1);
        for (const name of this.outputNames) {
          if (arg1Keys.indexOf(name) !== -1) {
            const v = arg1[name];
            if (v === null || v instanceof Tensor2) {
              isFetches = true;
              isFetchesEmpty = false;
              fetches[name] = v;
            }
          }
        }
        if (isFetches) {
          if (typeof arg2 === "object" && arg2 !== null) {
            options = arg2;
          } else if (typeof arg2 !== "undefined") {
            throw new TypeError("'options' must be an object.");
          }
        } else {
          options = arg1;
        }
      }
    } else if (typeof arg1 !== "undefined") {
      throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");
    }
    for (const name of this.inputNames) {
      if (typeof feeds[name] === "undefined") {
        throw new Error(`input '${name}' is missing in 'feeds'.`);
      }
    }
    if (isFetchesEmpty) {
      for (const name of this.outputNames) {
        fetches[name] = null;
      }
    }
    const results = await this.handler.run(feeds, fetches, options);
    const returnValue = {};
    for (const key in results) {
      if (Object.hasOwnProperty.call(results, key)) {
        const result = results[key];
        if (result instanceof Tensor2) {
          returnValue[key] = result;
        } else {
          returnValue[key] = new Tensor2(result.type, result.data, result.dims);
        }
      }
    }
    TRACE_EVENT_END("InferenceSession.run");
    TRACE_FUNC_END();
    return returnValue;
  }
  async release() {
    return this.handler.dispose();
  }
  static async create(arg0, arg1, arg2, arg3) {
    TRACE_FUNC_BEGIN();
    TRACE_EVENT_BEGIN("InferenceSession.create");
    let filePathOrUint8Array;
    let options = {};
    if (typeof arg0 === "string") {
      filePathOrUint8Array = arg0;
      if (typeof arg1 === "object" && arg1 !== null) {
        options = arg1;
      } else if (typeof arg1 !== "undefined") {
        throw new TypeError("'options' must be an object.");
      }
    } else if (arg0 instanceof Uint8Array) {
      filePathOrUint8Array = arg0;
      if (typeof arg1 === "object" && arg1 !== null) {
        options = arg1;
      } else if (typeof arg1 !== "undefined") {
        throw new TypeError("'options' must be an object.");
      }
    } else if (arg0 instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && arg0 instanceof SharedArrayBuffer) {
      const buffer = arg0;
      let byteOffset = 0;
      let byteLength = arg0.byteLength;
      if (typeof arg1 === "object" && arg1 !== null) {
        options = arg1;
      } else if (typeof arg1 === "number") {
        byteOffset = arg1;
        if (!Number.isSafeInteger(byteOffset)) {
          throw new RangeError("'byteOffset' must be an integer.");
        }
        if (byteOffset < 0 || byteOffset >= buffer.byteLength) {
          throw new RangeError(`'byteOffset' is out of range [0, ${buffer.byteLength}).`);
        }
        byteLength = arg0.byteLength - byteOffset;
        if (typeof arg2 === "number") {
          byteLength = arg2;
          if (!Number.isSafeInteger(byteLength)) {
            throw new RangeError("'byteLength' must be an integer.");
          }
          if (byteLength <= 0 || byteOffset + byteLength > buffer.byteLength) {
            throw new RangeError(`'byteLength' is out of range (0, ${buffer.byteLength - byteOffset}].`);
          }
          if (typeof arg3 === "object" && arg3 !== null) {
            options = arg3;
          } else if (typeof arg3 !== "undefined") {
            throw new TypeError("'options' must be an object.");
          }
        } else if (typeof arg2 !== "undefined") {
          throw new TypeError("'byteLength' must be a number.");
        }
      } else if (typeof arg1 !== "undefined") {
        throw new TypeError("'options' must be an object.");
      }
      filePathOrUint8Array = new Uint8Array(buffer, byteOffset, byteLength);
    } else {
      throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");
    }
    const [backend2, optionsWithValidatedEPs] = await resolveBackendAndExecutionProviders(options);
    const handler = await backend2.createInferenceSessionHandler(filePathOrUint8Array, optionsWithValidatedEPs);
    TRACE_EVENT_END("InferenceSession.create");
    TRACE_FUNC_END();
    return new _InferenceSession(handler);
  }
  startProfiling() {
    this.handler.startProfiling();
  }
  endProfiling() {
    this.handler.endProfiling();
  }
  get inputNames() {
    return this.handler.inputNames;
  }
  get outputNames() {
    return this.handler.outputNames;
  }
  get inputMetadata() {
    return this.handler.inputMetadata;
  }
  get outputMetadata() {
    return this.handler.outputMetadata;
  }
};

// ../../node_modules/.pnpm/onnxruntime-common@1.24.0-dev.20251116-b39e144322/node_modules/onnxruntime-common/dist/esm/inference-session.js
var InferenceSession2 = InferenceSession;

// ../../node_modules/.pnpm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/node_modules/onnxruntime-web/dist/ort.node.min.mjs
var require2 = createRequire(import.meta.url);
var pe = Object.defineProperty;
var Et = Object.getOwnPropertyDescriptor;
var St = Object.getOwnPropertyNames;
var ht = Object.prototype.hasOwnProperty;
var de = ((e) => typeof require2 < "u" ? require2 : typeof Proxy < "u" ? new Proxy(e, { get: (t, n) => (typeof require2 < "u" ? require2 : t)[n] }) : e)(function(e) {
  if (typeof require2 < "u") return require2.apply(this, arguments);
  throw Error('Dynamic require of "' + e + '" is not supported');
});
var C = (e, t) => () => (e && (t = e(e = 0)), t);
var Ot = (e, t) => {
  for (var n in t) pe(e, n, { get: t[n], enumerable: true });
};
var It = (e, t, n, o) => {
  if (t && typeof t == "object" || typeof t == "function") for (let r of St(t)) !ht.call(e, r) && r !== n && pe(e, r, { get: () => t[r], enumerable: !(o = Et(t, r)) || o.enumerable });
  return e;
};
var Tt = (e) => It(pe({}, "__esModule", { value: true }), e);
var j;
var re = C(() => {
  "use strict";
  j = !!(typeof process < "u" && process.versions && process.versions.node);
});
var Ae;
var Lt;
var Bt;
var $;
var xe;
var De;
var _t;
var Pt;
var vt;
var Dt;
var Ue;
var Ce;
var me = C(() => {
  "use strict";
  re();
  Ae = j || typeof location > "u" ? void 0 : location.origin, Lt = import.meta.url > "file:" && import.meta.url < "file;", Bt = () => {
    if (!j) {
      if (Lt) {
        let e = URL;
        return new URL(new e("ort.node.min.mjs", import.meta.url).href, Ae).href;
      }
      return import.meta.url;
    }
  }, $ = Bt(), xe = () => {
    if ($ && !$.startsWith("blob:")) return $.substring(0, $.lastIndexOf("/") + 1);
  }, De = (e, t) => {
    try {
      let n = t ?? $;
      return (n ? new URL(e, n) : new URL(e)).origin === Ae;
    } catch {
      return false;
    }
  }, _t = (e, t) => {
    let n = t ?? $;
    try {
      return (n ? new URL(e, n) : new URL(e)).href;
    } catch {
      return;
    }
  }, Pt = (e, t) => `${t ?? "./"}${e}`, vt = async (e) => {
    let n = await (await fetch(e, { credentials: "same-origin" })).blob();
    return URL.createObjectURL(n);
  }, Dt = async (e) => (await import(
    /*webpackIgnore:true*/
    /*@vite-ignore*/
    e
  )).default, Ue = void 0, Ce = async (e, t, n, o) => {
    let r = Ue && !(e || t);
    if (r) if ($) r = De($) || o && !n;
    else if (o && !n) r = true;
    else throw new Error("cannot determine the script source URL.");
    if (r) return [void 0, Ue];
    {
      let a = "ort-wasm-simd-threaded.mjs", s = e ?? _t(a, t), i = !j && n && s && !De(s, t), u = i ? await vt(s) : s ?? Pt(a, t);
      return [i ? u : void 0, await Dt(u)];
    }
  };
});
var be;
var we;
var ne;
var Me;
var Ut;
var At;
var xt;
var We;
var E;
var V = C(() => {
  "use strict";
  me();
  we = false, ne = false, Me = false, Ut = () => {
    if (typeof SharedArrayBuffer > "u") return false;
    try {
      return typeof MessageChannel < "u" && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 4, 1, 3, 1, 1, 10, 11, 1, 9, 0, 65, 0, 254, 16, 2, 0, 26, 11]));
    } catch {
      return false;
    }
  }, At = () => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11]));
    } catch {
      return false;
    }
  }, xt = () => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 19, 1, 17, 0, 65, 1, 253, 15, 65, 2, 253, 15, 65, 3, 253, 15, 253, 147, 2, 11]));
    } catch {
      return false;
    }
  }, We = async (e) => {
    if (we) return Promise.resolve();
    if (ne) throw new Error("multiple calls to 'initializeWebAssembly()' detected.");
    if (Me) throw new Error("previous call to 'initializeWebAssembly()' failed.");
    ne = true;
    let t = e.initTimeout, n = e.numThreads;
    if (e.simd !== false) {
      if (e.simd === "relaxed") {
        if (!xt()) throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.");
      } else if (!At()) throw new Error("WebAssembly SIMD is not supported in the current environment.");
    }
    let o = Ut();
    n > 1 && !o && (typeof self < "u" && !self.crossOriginIsolated && console.warn("env.wasm.numThreads is set to " + n + ", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."), console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."), e.numThreads = n = 1);
    let r = e.wasmPaths, a = typeof r == "string" ? r : void 0, s = r?.mjs, i = s?.href ?? s, u = r?.wasm, f = u?.href ?? u, w = e.wasmBinary, [l, c] = await Ce(i, a, n > 1, !!w || !!f), p = false, S = [];
    if (t > 0 && S.push(new Promise((h) => {
      setTimeout(() => {
        p = true, h();
      }, t);
    })), S.push(new Promise((h, v) => {
      let m = { numThreads: n };
      if (w) m.wasmBinary = w, m.locateFile = (b) => b;
      else if (f || a) m.locateFile = (b) => f ?? a + b;
      else if (i && i.indexOf("blob:") !== 0) m.locateFile = (b) => new URL(b, i).href;
      else if (l) {
        let b = xe();
        b && (m.locateFile = (M) => b + M);
      }
      c(m).then((b) => {
        ne = false, we = true, be = b, h(), l && URL.revokeObjectURL(l);
      }, (b) => {
        ne = false, Me = true, v(b);
      });
    })), await Promise.race(S), p) throw new Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`);
  }, E = () => {
    if (we && be) return be;
    throw new Error("WebAssembly is not initialized yet.");
  };
});
var A;
var K;
var g;
var oe = C(() => {
  "use strict";
  V();
  A = (e, t) => {
    let n = E(), o = n.lengthBytesUTF8(e) + 1, r = n._malloc(o);
    return n.stringToUTF8(e, r, o), t.push(r), r;
  }, K = (e, t, n, o) => {
    if (typeof e == "object" && e !== null) {
      if (n.has(e)) throw new Error("Circular reference in options");
      n.add(e);
    }
    Object.entries(e).forEach(([r, a]) => {
      let s = t ? t + r : r;
      if (typeof a == "object") K(a, s + ".", n, o);
      else if (typeof a == "string" || typeof a == "number") o(s, a.toString());
      else if (typeof a == "boolean") o(s, a ? "1" : "0");
      else throw new Error(`Can't handle extra config type: ${typeof a}`);
    });
  }, g = (e) => {
    let t = E(), n = t.stackSave();
    try {
      let o = t.PTR_SIZE, r = t.stackAlloc(2 * o);
      t._OrtGetLastError(r, r + o);
      let a = Number(t.getValue(r, o === 4 ? "i32" : "i64")), s = t.getValue(r + o, "*"), i = s ? t.UTF8ToString(s) : "";
      throw new Error(`${e} ERROR_CODE: ${a}, ERROR_MESSAGE: ${i}`);
    } finally {
      t.stackRestore(n);
    }
  };
});
var Fe;
var ke = C(() => {
  "use strict";
  V();
  oe();
  Fe = (e) => {
    let t = E(), n = 0, o = [], r = e || {};
    try {
      if (e?.logSeverityLevel === void 0) r.logSeverityLevel = 2;
      else if (typeof e.logSeverityLevel != "number" || !Number.isInteger(e.logSeverityLevel) || e.logSeverityLevel < 0 || e.logSeverityLevel > 4) throw new Error(`log severity level is not valid: ${e.logSeverityLevel}`);
      if (e?.logVerbosityLevel === void 0) r.logVerbosityLevel = 0;
      else if (typeof e.logVerbosityLevel != "number" || !Number.isInteger(e.logVerbosityLevel)) throw new Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);
      e?.terminate === void 0 && (r.terminate = false);
      let a = 0;
      return e?.tag !== void 0 && (a = A(e.tag, o)), n = t._OrtCreateRunOptions(r.logSeverityLevel, r.logVerbosityLevel, !!r.terminate, a), n === 0 && g("Can't create run options."), e?.extra !== void 0 && K(e.extra, "", /* @__PURE__ */ new WeakSet(), (s, i) => {
        let u = A(s, o), f = A(i, o);
        t._OrtAddRunConfigEntry(n, u, f) !== 0 && g(`Can't set a run config entry: ${s} - ${i}.`);
      }), [n, o];
    } catch (a) {
      throw n !== 0 && t._OrtReleaseRunOptions(n), o.forEach((s) => t._free(s)), a;
    }
  };
});
var Ct;
var Mt;
var Wt;
var se;
var Ft;
var Re;
var Ne = C(() => {
  "use strict";
  V();
  oe();
  Ct = (e) => {
    switch (e) {
      case "disabled":
        return 0;
      case "basic":
        return 1;
      case "extended":
        return 2;
      case "layout":
        return 3;
      case "all":
        return 99;
      default:
        throw new Error(`unsupported graph optimization level: ${e}`);
    }
  }, Mt = (e) => {
    switch (e) {
      case "sequential":
        return 0;
      case "parallel":
        return 1;
      default:
        throw new Error(`unsupported execution mode: ${e}`);
    }
  }, Wt = (e) => {
    e.extra || (e.extra = {}), e.extra.session || (e.extra.session = {});
    let t = e.extra.session;
    t.use_ort_model_bytes_directly || (t.use_ort_model_bytes_directly = "1"), e.executionProviders && e.executionProviders.some((n) => (typeof n == "string" ? n : n.name) === "webgpu") && (e.enableMemPattern = false);
  }, se = (e, t, n, o) => {
    let r = A(t, o), a = A(n, o);
    E()._OrtAddSessionConfigEntry(e, r, a) !== 0 && g(`Can't set a session config entry: ${t} - ${n}.`);
  }, Ft = async (e, t, n) => {
    let o = t.executionProviders;
    for (let r of o) {
      let a = typeof r == "string" ? r : r.name, s = [];
      switch (a) {
        case "webnn":
          if (a = "WEBNN", typeof r != "string") {
            let c = r?.deviceType;
            c && se(e, "deviceType", c, n);
          }
          break;
        case "webgpu":
          if (a = "JS", typeof r != "string") {
            let l = r;
            if (l?.preferredLayout) {
              if (l.preferredLayout !== "NCHW" && l.preferredLayout !== "NHWC") throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${l.preferredLayout}`);
              se(e, "preferredLayout", l.preferredLayout, n);
            }
          }
          break;
        case "wasm":
        case "cpu":
          continue;
        default:
          throw new Error(`not supported execution provider: ${a}`);
      }
      let i = A(a, n), u = s.length, f = 0, w = 0;
      if (u > 0) {
        f = E()._malloc(u * E().PTR_SIZE), n.push(f), w = E()._malloc(u * E().PTR_SIZE), n.push(w);
        for (let l = 0; l < u; l++) E().setValue(f + l * E().PTR_SIZE, s[l][0], "*"), E().setValue(w + l * E().PTR_SIZE, s[l][1], "*");
      }
      await E()._OrtAppendExecutionProvider(e, i, f, w, u) !== 0 && g(`Can't append execution provider: ${a}.`);
    }
  }, Re = async (e) => {
    let t = E(), n = 0, o = [], r = e || {};
    Wt(r);
    try {
      let a = Ct(r.graphOptimizationLevel ?? "all"), s = Mt(r.executionMode ?? "sequential"), i = typeof r.logId == "string" ? A(r.logId, o) : 0, u = r.logSeverityLevel ?? 2;
      if (!Number.isInteger(u) || u < 0 || u > 4) throw new Error(`log severity level is not valid: ${u}`);
      let f = r.logVerbosityLevel ?? 0;
      if (!Number.isInteger(f) || f < 0 || f > 4) throw new Error(`log verbosity level is not valid: ${f}`);
      let w = typeof r.optimizedModelFilePath == "string" ? A(r.optimizedModelFilePath, o) : 0;
      if (n = t._OrtCreateSessionOptions(a, !!r.enableCpuMemArena, !!r.enableMemPattern, s, !!r.enableProfiling, 0, i, u, f, w), n === 0 && g("Can't create session options."), r.executionProviders && await Ft(n, r, o), r.enableGraphCapture !== void 0) {
        if (typeof r.enableGraphCapture != "boolean") throw new Error(`enableGraphCapture must be a boolean value: ${r.enableGraphCapture}`);
        se(n, "enableGraphCapture", r.enableGraphCapture.toString(), o);
      }
      if (r.freeDimensionOverrides) for (let [l, c] of Object.entries(r.freeDimensionOverrides)) {
        if (typeof l != "string") throw new Error(`free dimension override name must be a string: ${l}`);
        if (typeof c != "number" || !Number.isInteger(c) || c < 0) throw new Error(`free dimension override value must be a non-negative integer: ${c}`);
        let p = A(l, o);
        t._OrtAddFreeDimensionOverride(n, p, c) !== 0 && g(`Can't set a free dimension override: ${l} - ${c}.`);
      }
      return r.extra !== void 0 && K(r.extra, "", /* @__PURE__ */ new WeakSet(), (l, c) => {
        se(n, l, c, o);
      }), [n, o];
    } catch (a) {
      throw n !== 0 && t._OrtReleaseSessionOptions(n) !== 0 && g("Can't release session options."), o.forEach((s) => t._free(s)), a;
    }
  };
});
var J;
var ae;
var q;
var Ge;
var je;
var ie;
var ue;
var $e;
var ge = C(() => {
  "use strict";
  J = (e) => {
    switch (e) {
      case "int8":
        return 3;
      case "uint8":
        return 2;
      case "bool":
        return 9;
      case "int16":
        return 5;
      case "uint16":
        return 4;
      case "int32":
        return 6;
      case "uint32":
        return 12;
      case "float16":
        return 10;
      case "float32":
        return 1;
      case "float64":
        return 11;
      case "string":
        return 8;
      case "int64":
        return 7;
      case "uint64":
        return 13;
      case "int4":
        return 22;
      case "uint4":
        return 21;
      default:
        throw new Error(`unsupported data type: ${e}`);
    }
  }, ae = (e) => {
    switch (e) {
      case 3:
        return "int8";
      case 2:
        return "uint8";
      case 9:
        return "bool";
      case 5:
        return "int16";
      case 4:
        return "uint16";
      case 6:
        return "int32";
      case 12:
        return "uint32";
      case 10:
        return "float16";
      case 1:
        return "float32";
      case 11:
        return "float64";
      case 8:
        return "string";
      case 7:
        return "int64";
      case 13:
        return "uint64";
      case 22:
        return "int4";
      case 21:
        return "uint4";
      default:
        throw new Error(`unsupported data type: ${e}`);
    }
  }, q = (e, t) => {
    let n = [-1, 4, 1, 1, 2, 2, 4, 8, -1, 1, 2, 8, 4, 8, -1, -1, -1, -1, -1, -1, -1, 0.5, 0.5][e], o = typeof t == "number" ? t : t.reduce((r, a) => r * a, 1);
    return n > 0 ? Math.ceil(o * n) : void 0;
  }, Ge = (e) => {
    switch (e) {
      case "float16":
        return typeof Float16Array < "u" && Float16Array.from ? Float16Array : Uint16Array;
      case "float32":
        return Float32Array;
      case "uint8":
        return Uint8Array;
      case "int8":
        return Int8Array;
      case "uint16":
        return Uint16Array;
      case "int16":
        return Int16Array;
      case "int32":
        return Int32Array;
      case "bool":
        return Uint8Array;
      case "float64":
        return Float64Array;
      case "uint32":
        return Uint32Array;
      case "int64":
        return BigInt64Array;
      case "uint64":
        return BigUint64Array;
      default:
        throw new Error(`unsupported type: ${e}`);
    }
  }, je = (e) => {
    switch (e) {
      case "verbose":
        return 0;
      case "info":
        return 1;
      case "warning":
        return 2;
      case "error":
        return 3;
      case "fatal":
        return 4;
      default:
        throw new Error(`unsupported logging level: ${e}`);
    }
  }, ie = (e) => e === "float32" || e === "float16" || e === "int32" || e === "int64" || e === "uint32" || e === "uint8" || e === "bool" || e === "uint4" || e === "int4", ue = (e) => e === "float32" || e === "float16" || e === "int32" || e === "int64" || e === "uint32" || e === "uint64" || e === "int8" || e === "uint8" || e === "bool" || e === "uint4" || e === "int4", $e = (e) => {
    switch (e) {
      case "none":
        return 0;
      case "cpu":
        return 1;
      case "cpu-pinned":
        return 2;
      case "texture":
        return 3;
      case "gpu-buffer":
        return 4;
      case "ml-tensor":
        return 5;
      default:
        throw new Error(`unsupported data location: ${e}`);
    }
  };
});
var Q;
var ye = C(() => {
  "use strict";
  re();
  Q = async (e) => {
    if (typeof e == "string") if (j) try {
      let { readFile: t } = de("node:fs/promises");
      return new Uint8Array(await t(e));
    } catch (t) {
      if (t.code === "ERR_FS_FILE_TOO_LARGE") {
        let { createReadStream: n } = de("node:fs"), o = n(e), r = [];
        for await (let a of o) r.push(a);
        return new Uint8Array(Buffer.concat(r));
      }
      throw t;
    }
    else {
      let t = await fetch(e);
      if (!t.ok) throw new Error(`failed to load external data file: ${e}`);
      let n = t.headers.get("Content-Length"), o = n ? parseInt(n, 10) : 0;
      if (o < 1073741824) return new Uint8Array(await t.arrayBuffer());
      {
        if (!t.body) throw new Error(`failed to load external data file: ${e}, no response body.`);
        let r = t.body.getReader(), a;
        try {
          a = new ArrayBuffer(o);
        } catch (i) {
          if (i instanceof RangeError) {
            let u = Math.ceil(o / 65536);
            a = new WebAssembly.Memory({ initial: u, maximum: u }).buffer;
          } else throw i;
        }
        let s = 0;
        for (; ; ) {
          let { done: i, value: u } = await r.read();
          if (i) break;
          let f = u.byteLength;
          new Uint8Array(a, s, f).set(u), s += f;
        }
        return new Uint8Array(a, 0, o);
      }
    }
    else return e instanceof Blob ? new Uint8Array(await e.arrayBuffer()) : e instanceof Uint8Array ? e : new Uint8Array(e);
  };
});
var kt;
var qe;
var Ye;
var Y;
var Rt;
var Ve;
var Ee;
var Ze;
var Xe;
var Je;
var Ke;
var Qe;
var et = C(() => {
  "use strict";
  ke();
  Ne();
  ge();
  V();
  oe();
  ye();
  kt = (e, t) => {
    E()._OrtInit(e, t) !== 0 && g("Can't initialize onnxruntime.");
  }, qe = async (e) => {
    kt(e.wasm.numThreads, je(e.logLevel));
  }, Ye = async (e, t) => {
    E().asyncInit?.();
    let n = e.webgpu.adapter;
    if (t === "webgpu") {
      if (typeof navigator > "u" || !navigator.gpu) throw new Error("WebGPU is not supported in current environment");
      if (n) {
        if (typeof n.limits != "object" || typeof n.features != "object" || typeof n.requestDevice != "function") throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.");
      } else {
        let o = e.webgpu.powerPreference;
        if (o !== void 0 && o !== "low-power" && o !== "high-performance") throw new Error(`Invalid powerPreference setting: "${o}"`);
        let r = e.webgpu.forceFallbackAdapter;
        if (r !== void 0 && typeof r != "boolean") throw new Error(`Invalid forceFallbackAdapter setting: "${r}"`);
        if (n = await navigator.gpu.requestAdapter({ powerPreference: o, forceFallbackAdapter: r }), !n) throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.');
      }
    }
    if (t === "webnn" && (typeof navigator > "u" || !navigator.ml)) throw new Error("WebNN is not supported in current environment");
  }, Y = /* @__PURE__ */ new Map(), Rt = (e) => {
    let t = E(), n = t.stackSave();
    try {
      let o = t.PTR_SIZE, r = t.stackAlloc(2 * o);
      t._OrtGetInputOutputCount(e, r, r + o) !== 0 && g("Can't get session input/output count.");
      let s = o === 4 ? "i32" : "i64";
      return [Number(t.getValue(r, s)), Number(t.getValue(r + o, s))];
    } finally {
      t.stackRestore(n);
    }
  }, Ve = (e, t) => {
    let n = E(), o = n.stackSave(), r = 0;
    try {
      let a = n.PTR_SIZE, s = n.stackAlloc(2 * a);
      n._OrtGetInputOutputMetadata(e, t, s, s + a) !== 0 && g("Can't get session input/output metadata.");
      let u = Number(n.getValue(s, "*"));
      r = Number(n.getValue(s + a, "*"));
      let f = n.HEAP32[r / 4];
      if (f === 0) return [u, 0];
      let w = n.HEAPU32[r / 4 + 1], l = [];
      for (let c = 0; c < w; c++) {
        let p = Number(n.getValue(r + 8 + c * a, "*"));
        l.push(p !== 0 ? n.UTF8ToString(p) : Number(n.getValue(r + 8 + (c + w) * a, "*")));
      }
      return [u, f, l];
    } finally {
      n.stackRestore(o), r !== 0 && n._OrtFree(r);
    }
  }, Ee = (e) => {
    let t = E(), n = t._malloc(e.byteLength);
    if (n === 0) throw new Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);
    return t.HEAPU8.set(e, n), [n, e.byteLength];
  }, Ze = async (e, t) => {
    let n, o, r = E();
    Array.isArray(e) ? [n, o] = e : e.buffer === r.HEAPU8.buffer ? [n, o] = [e.byteOffset, e.byteLength] : [n, o] = Ee(e);
    let a = 0, s = 0, i = 0, u = [], f = [], w = [];
    try {
      if ([s, u] = await Re(t), t?.externalData && r.mountExternalData) {
        let y = [];
        for (let O of t.externalData) {
          let B = typeof O == "string" ? O : O.path;
          y.push(Q(typeof O == "string" ? O : O.data).then((U) => {
            r.mountExternalData(B, U);
          }));
        }
        await Promise.all(y);
      }
      for (let y of t?.executionProviders ?? []) if ((typeof y == "string" ? y : y.name) === "webnn") {
        if (r.shouldTransferToMLTensor = false, typeof y != "string") {
          let B = y, U = B?.context, _ = B?.gpuDevice, Z = B?.deviceType, z = B?.powerPreference;
          U ? r.currentContext = U : _ ? r.currentContext = await r.webnnCreateMLContext(_) : r.currentContext = await r.webnnCreateMLContext({ deviceType: Z, powerPreference: z });
        } else r.currentContext = await r.webnnCreateMLContext();
        break;
      }
      a = await r._OrtCreateSession(n, o, s), r.webgpuOnCreateSession?.(a), a === 0 && g("Can't create a session."), r.jsepOnCreateSession?.(), r.currentContext && (r.webnnRegisterMLContext(a, r.currentContext), r.currentContext = void 0, r.shouldTransferToMLTensor = true);
      let [l, c] = Rt(a), p = !!t?.enableGraphCapture, S = [], h = [], v = [], m = [], b = [];
      for (let y = 0; y < l; y++) {
        let [O, B, U] = Ve(a, y);
        O === 0 && g("Can't get an input name."), f.push(O);
        let _ = r.UTF8ToString(O);
        S.push(_), v.push(B === 0 ? { name: _, isTensor: false } : { name: _, isTensor: true, type: ae(B), shape: U });
      }
      for (let y = 0; y < c; y++) {
        let [O, B, U] = Ve(a, y + l);
        O === 0 && g("Can't get an output name."), w.push(O);
        let _ = r.UTF8ToString(O);
        h.push(_), m.push(B === 0 ? { name: _, isTensor: false } : { name: _, isTensor: true, type: ae(B), shape: U });
      }
      return Y.set(a, [a, f, w, null, p, false]), [a, S, h, v, m];
    } catch (l) {
      throw f.forEach((c) => r._OrtFree(c)), w.forEach((c) => r._OrtFree(c)), i !== 0 && r._OrtReleaseBinding(i) !== 0 && g("Can't release IO binding."), a !== 0 && r._OrtReleaseSession(a) !== 0 && g("Can't release session."), l;
    } finally {
      r._free(n), s !== 0 && r._OrtReleaseSessionOptions(s) !== 0 && g("Can't release session options."), u.forEach((l) => r._free(l)), r.unmountExternalData?.();
    }
  }, Xe = (e) => {
    let t = E(), n = Y.get(e);
    if (!n) throw new Error(`cannot release session. invalid session id: ${e}`);
    let [o, r, a, s, i] = n;
    s && (i && t._OrtClearBoundOutputs(s.handle) !== 0 && g("Can't clear bound outputs."), t._OrtReleaseBinding(s.handle) !== 0 && g("Can't release IO binding.")), t.jsepOnReleaseSession?.(e), t.webnnOnReleaseSession?.(e), t.webgpuOnReleaseSession?.(e), r.forEach((u) => t._OrtFree(u)), a.forEach((u) => t._OrtFree(u)), t._OrtReleaseSession(o) !== 0 && g("Can't release session."), Y.delete(e);
  }, Je = async (e, t, n, o, r, a, s = false) => {
    if (!e) {
      t.push(0);
      return;
    }
    let i = E(), u = i.PTR_SIZE, f = e[0], w = e[1], l = e[3], c = l, p, S;
    if (f === "string" && (l === "gpu-buffer" || l === "ml-tensor")) throw new Error("String tensor is not supported on GPU.");
    if (s && l !== "gpu-buffer") throw new Error(`External buffer must be provided for input/output index ${a} when enableGraphCapture is true.`);
    if (l === "gpu-buffer") {
      let m = e[2].gpuBuffer;
      S = q(J(f), w);
      {
        let b = i.jsepRegisterBuffer;
        if (!b) throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');
        p = b(o, a, m, S);
      }
    } else if (l === "ml-tensor") {
      let m = e[2].mlTensor;
      S = q(J(f), w);
      let b = i.webnnRegisterMLTensor;
      if (!b) throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');
      p = b(o, m, J(f), w);
    } else {
      let m = e[2];
      if (Array.isArray(m)) {
        S = u * m.length, p = i._malloc(S), n.push(p);
        for (let b = 0; b < m.length; b++) {
          if (typeof m[b] != "string") throw new TypeError(`tensor data at index ${b} is not a string`);
          i.setValue(p + b * u, A(m[b], n), "*");
        }
      } else {
        let b = i.webnnIsGraphInput, M = i.webnnIsGraphOutput;
        if (f !== "string" && b && M) {
          let y = i.UTF8ToString(r);
          if (b(o, y) || M(o, y)) {
            let O = J(f);
            S = q(O, w), c = "ml-tensor";
            let B = i.webnnCreateTemporaryTensor, U = i.webnnUploadTensor;
            if (!B || !U) throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');
            let _ = await B(o, O, w);
            U(_, new Uint8Array(m.buffer, m.byteOffset, m.byteLength)), p = _;
          } else S = m.byteLength, p = i._malloc(S), n.push(p), i.HEAPU8.set(new Uint8Array(m.buffer, m.byteOffset, S), p);
        } else S = m.byteLength, p = i._malloc(S), n.push(p), i.HEAPU8.set(new Uint8Array(m.buffer, m.byteOffset, S), p);
      }
    }
    let h = i.stackSave(), v = i.stackAlloc(4 * w.length);
    try {
      w.forEach((b, M) => i.setValue(v + M * u, b, u === 4 ? "i32" : "i64"));
      let m = i._OrtCreateTensor(J(f), p, S, v, w.length, $e(c));
      m === 0 && g(`Can't create tensor for input/output. session=${o}, index=${a}.`), t.push(m);
    } finally {
      i.stackRestore(h);
    }
  }, Ke = async (e, t, n, o, r, a) => {
    let s = E(), i = s.PTR_SIZE, u = Y.get(e);
    if (!u) throw new Error(`cannot run inference. invalid session id: ${e}`);
    let f = u[0], w = u[1], l = u[2], c = u[3], p = u[4], S = u[5], h = t.length, v = o.length, m = 0, b = [], M = [], y = [], O = [], B = [], U = s.stackSave(), _ = s.stackAlloc(h * i), Z = s.stackAlloc(h * i), z = s.stackAlloc(v * i), Te = s.stackAlloc(v * i);
    try {
      [m, b] = Fe(a), TRACE_EVENT_BEGIN("wasm prepareInputOutputTensor");
      for (let d = 0; d < h; d++) await Je(n[d], M, O, e, w[t[d]], t[d], p);
      for (let d = 0; d < v; d++) await Je(r[d], y, O, e, l[o[d]], h + o[d], p);
      TRACE_EVENT_END("wasm prepareInputOutputTensor");
      for (let d = 0; d < h; d++) s.setValue(_ + d * i, M[d], "*"), s.setValue(Z + d * i, w[t[d]], "*");
      for (let d = 0; d < v; d++) s.setValue(z + d * i, y[d], "*"), s.setValue(Te + d * i, l[o[d]], "*");
      s.jsepOnRunStart?.(f), s.webnnOnRunStart?.(f);
      let x;
      x = await s._OrtRun(f, Z, _, h, Te, v, z, m), x !== 0 && g("failed to call OrtRun().");
      let k = [], Le = [];
      TRACE_EVENT_BEGIN("wasm ProcessOutputTensor");
      for (let d = 0; d < v; d++) {
        let W = Number(s.getValue(z + d * i, "*"));
        if (W === y[d] || B.includes(y[d])) {
          k.push(r[d]), W !== y[d] && s._OrtReleaseTensor(W) !== 0 && g("Can't release tensor.");
          continue;
        }
        let Be = s.stackSave(), F = s.stackAlloc(4 * i), H = false, T, P = 0;
        try {
          s._OrtGetTensorData(W, F, F + i, F + 2 * i, F + 3 * i) !== 0 && g(`Can't access output tensor data on index ${d}.`);
          let fe = i === 4 ? "i32" : "i64", ee = Number(s.getValue(F, fe));
          P = s.getValue(F + i, "*");
          let _e = s.getValue(F + i * 2, "*"), yt = Number(s.getValue(F + i * 3, fe)), R = [];
          for (let L = 0; L < yt; L++) R.push(Number(s.getValue(_e + L * i, fe)));
          s._OrtFree(_e) !== 0 && g("Can't free memory for tensor dims.");
          let N = R.reduce((L, I) => L * I, 1);
          T = ae(ee);
          let X = c?.outputPreferredLocations[o[d]];
          if (T === "string") {
            if (X === "gpu-buffer" || X === "ml-tensor") throw new Error("String tensor is not supported on GPU.");
            let L = [];
            for (let I = 0; I < N; I++) {
              let G = s.getValue(P + I * i, "*"), te = s.getValue(P + (I + 1) * i, "*"), Pe = I === N - 1 ? void 0 : te - G;
              L.push(s.UTF8ToString(G, Pe));
            }
            k.push([T, R, L, "cpu"]);
          } else if (X === "gpu-buffer" && N > 0) {
            let L = s.jsepGetBuffer;
            if (!L) throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');
            let I = L(P), G = q(ee, N);
            if (G === void 0 || !ie(T)) throw new Error(`Unsupported data type: ${T}`);
            H = true, k.push([T, R, { gpuBuffer: I, download: s.jsepCreateDownloader(I, G, T), dispose: () => {
              s._OrtReleaseTensor(W) !== 0 && g("Can't release tensor.");
            } }, "gpu-buffer"]);
          } else if (X === "ml-tensor" && N > 0) {
            let L = s.webnnEnsureTensor, I = s.webnnIsGraphInputOutputTypeSupported;
            if (!L || !I) throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');
            if (q(ee, N) === void 0 || !ue(T)) throw new Error(`Unsupported data type: ${T}`);
            if (!I(e, T, false)) throw new Error(`preferredLocation "ml-tensor" for ${T} output is not supported by current WebNN Context.`);
            let te = await L(e, P, ee, R, false);
            H = true, k.push([T, R, { mlTensor: te, download: s.webnnCreateMLTensorDownloader(P, T), dispose: () => {
              s.webnnReleaseTensorId(P), s._OrtReleaseTensor(W);
            } }, "ml-tensor"]);
          } else if (X === "ml-tensor-cpu-output" && N > 0) {
            let L = s.webnnCreateMLTensorDownloader(P, T)(), I = k.length;
            H = true, Le.push((async () => {
              let G = [I, await L];
              return s.webnnReleaseTensorId(P), s._OrtReleaseTensor(W), G;
            })()), k.push([T, R, [], "cpu"]);
          } else {
            let L = Ge(T), I = new L(N);
            new Uint8Array(I.buffer, I.byteOffset, I.byteLength).set(s.HEAPU8.subarray(P, P + I.byteLength)), k.push([T, R, I, "cpu"]);
          }
        } finally {
          s.stackRestore(Be), T === "string" && P && s._free(P), H || s._OrtReleaseTensor(W);
        }
      }
      c && !p && (s._OrtClearBoundOutputs(c.handle) !== 0 && g("Can't clear bound outputs."), Y.set(e, [f, w, l, c, p, false]));
      for (let [d, W] of await Promise.all(Le)) k[d][2] = W;
      return TRACE_EVENT_END("wasm ProcessOutputTensor"), k;
    } finally {
      s.webnnOnRunEnd?.(f), s.stackRestore(U), M.forEach((x) => s._OrtReleaseTensor(x)), y.forEach((x) => s._OrtReleaseTensor(x)), O.forEach((x) => s._free(x)), m !== 0 && s._OrtReleaseRunOptions(m), b.forEach((x) => s._free(x));
    }
  }, Qe = (e) => {
    let t = E(), n = Y.get(e);
    if (!n) throw new Error("invalid session id");
    let o = n[0], r = t._OrtEndProfiling(o);
    r === 0 && g("Can't get an profile file name."), t._OrtFree(r);
  };
});
var Se;
var tt;
var rt;
var nt;
var ot;
var st;
var at;
var it;
var ut;
var ct;
var Oe = C(() => {
  "use strict";
  et();
  V();
  me();
  Se = false, tt = false, rt = false, nt = async () => {
    if (!tt) {
      if (Se) throw new Error("multiple calls to 'initWasm()' detected.");
      if (rt) throw new Error("previous call to 'initWasm()' failed.");
      Se = true;
      try {
        await We(env2.wasm), await qe(env2), tt = true;
      } catch (e) {
        throw rt = true, e;
      } finally {
        Se = false;
      }
    }
  }, ot = async (e) => {
    await Ye(env2, e);
  }, st = async (e) => Ee(e), at = async (e, t) => Ze(e, t), it = async (e) => {
    Xe(e);
  }, ut = async (e, t, n, o, r, a) => Ke(e, t, n, o, r, a), ct = async (e) => {
    Qe(e);
  };
});
var pt;
var Gt;
var ce;
var dt = C(() => {
  "use strict";
  Oe();
  ge();
  re();
  ye();
  pt = (e, t) => {
    switch (e.location) {
      case "cpu":
        return [e.type, e.dims, e.data, "cpu"];
      case "gpu-buffer":
        return [e.type, e.dims, { gpuBuffer: e.gpuBuffer }, "gpu-buffer"];
      case "ml-tensor":
        return [e.type, e.dims, { mlTensor: e.mlTensor }, "ml-tensor"];
      default:
        throw new Error(`invalid data location: ${e.location} for ${t()}`);
    }
  }, Gt = (e) => {
    switch (e[3]) {
      case "cpu":
        return new Tensor2(e[0], e[2], e[1]);
      case "gpu-buffer": {
        let t = e[0];
        if (!ie(t)) throw new Error(`not supported data type: ${t} for deserializing GPU tensor`);
        let { gpuBuffer: n, download: o, dispose: r } = e[2];
        return Tensor2.fromGpuBuffer(n, { dataType: t, dims: e[1], download: o, dispose: r });
      }
      case "ml-tensor": {
        let t = e[0];
        if (!ue(t)) throw new Error(`not supported data type: ${t} for deserializing MLTensor tensor`);
        let { mlTensor: n, download: o, dispose: r } = e[2];
        return Tensor2.fromMLTensor(n, { dataType: t, dims: e[1], download: o, dispose: r });
      }
      default:
        throw new Error(`invalid data location: ${e[3]}`);
    }
  }, ce = class {
    async fetchModelAndCopyToWasmMemory(t) {
      return st(await Q(t));
    }
    async loadModel(t, n) {
      TRACE_FUNC_BEGIN();
      let o;
      typeof t == "string" ? j ? o = await Q(t) : o = await this.fetchModelAndCopyToWasmMemory(t) : o = t, [this.sessionId, this.inputNames, this.outputNames, this.inputMetadata, this.outputMetadata] = await at(o, n), TRACE_FUNC_END();
    }
    async dispose() {
      return it(this.sessionId);
    }
    async run(t, n, o) {
      TRACE_FUNC_BEGIN();
      let r = [], a = [];
      Object.entries(t).forEach((c) => {
        let p = c[0], S = c[1], h = this.inputNames.indexOf(p);
        if (h === -1) throw new Error(`invalid input '${p}'`);
        r.push(S), a.push(h);
      });
      let s = [], i = [];
      Object.entries(n).forEach((c) => {
        let p = c[0], S = c[1], h = this.outputNames.indexOf(p);
        if (h === -1) throw new Error(`invalid output '${p}'`);
        s.push(S), i.push(h);
      });
      let u = r.map((c, p) => pt(c, () => `input "${this.inputNames[a[p]]}"`)), f = s.map((c, p) => c ? pt(c, () => `output "${this.outputNames[i[p]]}"`) : null), w = await ut(this.sessionId, a, u, i, f, o), l = {};
      for (let c = 0; c < w.length; c++) l[this.outputNames[i[c]]] = s[c] ?? Gt(w[c]);
      return TRACE_FUNC_END(), l;
    }
    startProfiling() {
    }
    endProfiling() {
      ct(this.sessionId);
    }
  };
});
var bt = {};
Ot(bt, { OnnxruntimeWebAssemblyBackend: () => le, initializeFlags: () => mt, wasmBackend: () => jt });
var mt;
var le;
var jt;
var wt = C(() => {
  "use strict";
  Oe();
  dt();
  mt = () => {
    (typeof env2.wasm.initTimeout != "number" || env2.wasm.initTimeout < 0) && (env2.wasm.initTimeout = 0);
    let e = env2.wasm.simd;
    if (typeof e != "boolean" && e !== void 0 && e !== "fixed" && e !== "relaxed" && (console.warn(`Property "env.wasm.simd" is set to unknown value "${e}". Reset it to \`false\` and ignore SIMD feature checking.`), env2.wasm.simd = false), typeof env2.wasm.proxy != "boolean" && (env2.wasm.proxy = false), typeof env2.wasm.trace != "boolean" && (env2.wasm.trace = false), typeof env2.wasm.numThreads != "number" || !Number.isInteger(env2.wasm.numThreads) || env2.wasm.numThreads <= 0) if (typeof self < "u" && !self.crossOriginIsolated) env2.wasm.numThreads = 1;
    else {
      let t = typeof navigator > "u" ? de("node:os").cpus().length : navigator.hardwareConcurrency;
      env2.wasm.numThreads = Math.min(4, Math.ceil((t || 1) / 2));
    }
  }, le = class {
    async init(t) {
      mt(), await nt(), await ot(t);
    }
    async createInferenceSessionHandler(t, n) {
      let o = new ce();
      return await o.loadModel(t, n), o;
    }
  }, jt = new le();
});
var ve = "1.26.0-dev.20260416-b7804b056c";
{
  let e = (wt(), Tt(bt)).wasmBackend;
  registerBackend("cpu", e, 10), registerBackend("wasm", e, 10);
}
Object.defineProperty(env2.versions, "web", { value: ve, enumerable: true });

// src/tokenizer.ts
import fs from "node:fs";

// ../../node_modules/.pnpm/@huggingface+tokenizers@0.1.3/node_modules/@huggingface/tokenizers/dist/tokenizers.mjs
var DictionarySplitter = class {
  /**
   * @param dictionary The dictionary of words to use for splitting.
   */
  constructor(dictionary) {
    this.trie = this._build_trie(dictionary);
  }
  /**
   * Builds a trie from the given dictionary.
   * @param dictionary The dictionary of words to build the trie from.
   * @returns The root node of the trie.
   * @private
   */
  _build_trie(dictionary) {
    const trie = /* @__PURE__ */ Object.create(null);
    for (const word of dictionary) {
      let node = trie;
      for (let i = 0; i < word.length; ++i) {
        const char = word[i];
        node = node[char] ??= /* @__PURE__ */ Object.create(null);
      }
      node.end = word;
    }
    return trie;
  }
  /**
   * Splits the input text into tokens based on the dictionary.
   * @param text The input text to split.
   * @returns An array of tokens.
   */
  split(text) {
    const result = [];
    const n = text.length;
    let start = 0;
    let i = 0;
    while (i < n) {
      let node = this.trie;
      let match = null;
      let j2 = i;
      while (j2 < n && (node = node[text[j2]])) {
        if (node.end) {
          match = node.end;
        }
        ++j2;
      }
      if (match) {
        if (i > start) {
          result.push(text.slice(start, i));
        }
        result.push(match);
        i += match.length;
        start = i;
      } else {
        ++i;
      }
    }
    if (start < n) {
      result.push(text.slice(start));
    }
    return result;
  }
};
var DictionarySplitter_default = DictionarySplitter;
var AddedToken = class {
  /**
   * Creates a new instance of AddedToken.
   * @param config Added token configuration object.
   */
  constructor(config) {
    this.content = config.content;
    this.id = config.id;
    this.single_word = config.single_word ?? false;
    this.lstrip = config.lstrip ?? false;
    this.rstrip = config.rstrip ?? false;
    this.special = config.special ?? false;
    this.normalized = config.normalized ?? !this.special;
  }
};
var AddedToken_default = AddedToken;
var BYTES_TO_UNICODE = (() => {
  const bs = [
    ...Array.from(
      { length: "~".charCodeAt(0) - "!".charCodeAt(0) + 1 },
      (_, i) => i + "!".charCodeAt(0)
    ),
    ...Array.from(
      { length: "\xAC".charCodeAt(0) - "\xA1".charCodeAt(0) + 1 },
      (_, i) => i + "\xA1".charCodeAt(0)
    ),
    ...Array.from(
      { length: "\xFF".charCodeAt(0) - "\xAE".charCodeAt(0) + 1 },
      (_, i) => i + "\xAE".charCodeAt(0)
    )
  ];
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; ++b) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n += 1;
    }
  }
  const ccs = cs.map((n2) => String.fromCharCode(n2));
  return Object.fromEntries(bs.map((b, i) => [b, ccs[i]]));
})();
var reverse_dictionary = (data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [value, key]));
var UNICODE_TO_BYTES = reverse_dictionary(BYTES_TO_UNICODE);
var BLOOM_SPLIT_CHARS = ".,!?\u2026\u3002\uFF0C\u3001\u0964\u06D4\u060C";
var PROBLEMATIC_REGEX_MAP = /* @__PURE__ */ new Map([
  // These uses the case insensitive group modifier, which is not supported in JavaScript.
  // When parsing the regex, an "Invalid group" error is thrown.
  [
    "(?i:'s|'t|'re|'ve|'m|'ll|'d)",
    "(?:'([sS]|[tT]|[rR][eE]|[vV][eE]|[mM]|[lL][lL]|[dD]))"
  ],
  [
    "(?i:[sdmt]|ll|ve|re)",
    "(?:[sS]|[dD]|[mM]|[tT]|[lL][lL]|[vV][eE]|[rR][eE])"
  ],
  // JS doesn't support possessive quantifiers (these are used in recent OpenAI tokenizers).
  ["[^\\r\\n\\p{L}\\p{N}]?+", "[^\\r\\n\\p{L}\\p{N}]?"],
  ["[^\\s\\p{L}\\p{N}]++", "[^\\s\\p{L}\\p{N}]+"],
  // JS doesn't support atomic groups (these are used in AFMoE tokenizers).
  ["(?>\\p{Nd}{510})", "(?:\\p{Nd}{510})"],
  // JS doesn't support stacking quantifiers.
  // Uncaught SyntaxError: Invalid regular expression: /\p{Nd}{3}+/u: Nothing to repeat
  ["\\p{Nd}{3}+", "(?:\\p{Nd}{3})+"],
  // \G is an invalid escape in JS, and in most cases is just used as an optimization.
  // So, we can safely remove it.
  ["\\G", ""],
  // Used to override the default (invalid) regex of the bloom pretokenizer.
  // For more information, see https://github.com/huggingface/transformers.js/issues/94
  [` ?[^(\\s|[${BLOOM_SPLIT_CHARS}])]+`, ` ?[^\\s${BLOOM_SPLIT_CHARS}]+`]
]);
var PUNCTUATION_REGEX = "\\p{P}\\u0021-\\u002F\\u003A-\\u0040\\u005B-\\u0060\\u007B-\\u007E";
var clean_up_tokenization = (text) => text.replace(/ \./g, ".").replace(/ \?/g, "?").replace(/ \!/g, "!").replace(/ ,/g, ",").replace(/ \' /g, "'").replace(/ n't/g, "n't").replace(/ 'm/g, "'m").replace(/ 's/g, "'s").replace(/ 've/g, "'ve").replace(/ 're/g, "'re");
var create_pattern = (pattern, invert = true) => {
  if (pattern.Regex !== void 0) {
    let regex = pattern.Regex.replace(/\\([#&~])/g, "$1");
    regex = regex.replace(/\\A/g, "^").replace(/\\z/g, "$").replace(/\\Z/g, "(?=\\r?\\n?$)");
    for (const [key, value] of PROBLEMATIC_REGEX_MAP) {
      regex = regex.replaceAll(key, value);
    }
    try {
      return new RegExp(regex, "gu");
    } catch (error) {
      if (!(error instanceof SyntaxError) || !error.message.toLowerCase().includes("invalid property name"))
        throw error;
      let changed = false;
      const fixed = regex.replace(/(\\[pP])\{([^}=]+)\}/g, (_, p, n) => {
        try {
          new RegExp(`\\p{${n}}`, "u");
          return `${p}{${n}}`;
        } catch {
          changed = true;
          return `${p}{Script=${n}}`;
        }
      });
      if (!changed) throw error;
      try {
        return new RegExp(fixed, "gu");
      } catch (e) {
        throw error;
      }
    }
  } else if (pattern.String !== void 0) {
    const escaped = escape_reg_exp(pattern.String);
    return new RegExp(invert ? escaped : `(${escaped})`, "gu");
  } else {
    console.warn("Unknown pattern type:", pattern);
    return null;
  }
};
var escape_reg_exp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var fuse_unk = (arr, tokens_to_ids, unk_token_id) => {
  const fused = [];
  let i = 0;
  while (i < arr.length) {
    fused.push(arr[i]);
    const token_id = tokens_to_ids.get(arr[i]) ?? unk_token_id;
    if (token_id !== unk_token_id) {
      ++i;
      continue;
    }
    while (++i < arr.length && (tokens_to_ids.get(arr[i]) ?? unk_token_id) === unk_token_id) {
      if (tokens_to_ids.get(fused.at(-1)) !== unk_token_id) {
        fused[fused.length - 1] += arr[i];
      }
    }
  }
  return fused;
};
var is_chinese_char = (cp) => cp >= 19968 && cp <= 40959 || cp >= 13312 && cp <= 19903 || cp >= 131072 && cp <= 173791 || cp >= 173824 && cp <= 177983 || cp >= 177984 && cp <= 178207 || cp >= 178208 && cp <= 183983 || cp >= 63744 && cp <= 64255 || cp >= 194560 && cp <= 195103;
var is_integral_number = (x) => Number.isInteger(x) || typeof x === "bigint";
var len = (s) => {
  let length = 0;
  for (const c of s) ++length;
  return length;
};
var lowercase_and_remove_accents = (text) => remove_accents(text.toLowerCase());
var merge_arrays = (...arrs) => Array.prototype.concat.apply([], arrs);
var object_to_map = (obj) => new Map(Object.entries(obj));
var regex_split = (text, regex) => {
  const result = [];
  let prev = 0;
  for (const match of text.matchAll(regex)) {
    const full_match = match[0];
    if (prev < match.index) {
      result.push(text.slice(prev, match.index));
    }
    if (full_match.length > 0) {
      result.push(full_match);
    }
    prev = match.index + full_match.length;
  }
  if (prev < text.length) {
    result.push(text.slice(prev));
  }
  return result;
};
var remove_accents = (text) => text.replace(new RegExp("\\p{M}", "gu"), "");
var validate_object = (obj, name, required_keys = []) => {
  if (!obj || Array.isArray(obj) || typeof obj !== "object") {
    return `${name} must be a valid object`;
  }
  for (const key of required_keys) {
    if (!(key in obj)) {
      return `${name} must contain a "${key}" property`;
    }
  }
  return null;
};
var whitespace_split = (text) => text.match(/\S+/g) || [];
var Callable = class {
  /**
   * Creates a new instance of the Callable class.
   */
  constructor() {
    const closure = function(...args) {
      return closure._call(...args);
    };
    return Object.setPrototypeOf(closure, new.target.prototype);
  }
};
var Callable_default = Callable;
var Normalizer = class extends Callable_default {
  /**
   * @param config The configuration object for the normalizer.
   */
  constructor(config) {
    super();
    this.config = config;
  }
  /**
   * Alias for {@link Normalizer#normalize}.
   * @param text The text to normalize.
   * @returns The normalized text.
   */
  _call(text) {
    return this.normalize(text);
  }
};
var Normalizer_default = Normalizer;
var BertNormalizer = class extends Normalizer_default {
  /**
   * Adds whitespace around any CJK (Chinese, Japanese, or Korean) character in the input text.
   *
   * @param text The input text to tokenize.
   * @returns The tokenized text with whitespace added around CJK characters.
   */
  tokenize_chinese_chars(text) {
    const output = [];
    for (let i = 0; i < text.length; ++i) {
      const char = text[i];
      const cp = char.charCodeAt(0);
      if (is_chinese_char(cp)) {
        output.push(" ");
        output.push(char);
        output.push(" ");
      } else {
        output.push(char);
      }
    }
    return output.join("");
  }
  /**
   * Strips accents from the given text.
   * @param text The text to strip accents from.
   * @returns The text with accents removed.
   */
  strip_accents(text) {
    return text.normalize("NFD").replace(new RegExp("\\p{Mn}", "gu"), "");
  }
  /**
   * Checks whether `char` is a control character.
   * @param char The character to check.
   * @returns Whether `char` is a control character.
   */
  is_control(char) {
    switch (char) {
      case "	":
      case "\n":
      case "\r":
        return false;
      default:
        return new RegExp("^\\p{Cc}|\\p{Cf}|\\p{Co}|\\p{Cs}$", "u").test(char);
    }
  }
  /**
   * Performs invalid character removal and whitespace cleanup on text.
   * @param text The text to clean.
   * @returns The cleaned text.
   */
  clean_text(text) {
    const output = [];
    for (const char of text) {
      const cp = char.charCodeAt(0);
      if (cp === 0 || cp === 65533 || this.is_control(char)) {
        continue;
      }
      if (/^\s$/.test(char)) {
        output.push(" ");
      } else {
        output.push(char);
      }
    }
    return output.join("");
  }
  /**
   * Normalizes the given text based on the configuration.
   * @param text The text to normalize.
   * @returns The normalized text.
   */
  normalize(text) {
    if (this.config.clean_text) {
      text = this.clean_text(text);
    }
    if (this.config.handle_chinese_chars) {
      text = this.tokenize_chinese_chars(text);
    }
    if (this.config.lowercase) {
      text = text.toLowerCase();
      if (this.config.strip_accents !== false) {
        text = this.strip_accents(text);
      }
    } else if (this.config.strip_accents) {
      text = this.strip_accents(text);
    }
    return text;
  }
};
var BertNormalizer_default = BertNormalizer;
var Precompiled = class extends Normalizer_default {
  /**
   * Create a new instance of Precompiled normalizer.
   * @param config The configuration object.
   */
  constructor(config) {
    super(config);
    this.charsmap = config.precompiled_charsmap ?? null;
  }
  /**
   * Normalizes the given text by applying the precompiled charsmap.
   * @param text The text to normalize.
   * @returns The normalized text.
   */
  normalize(text) {
    text = text.replace(
      /[\u0001-\u0008\u000B\u000E-\u001F\u007F\u008F\u009F]/gm,
      ""
    );
    text = text.replace(
      /[\u0009\u000A\u000C\u000D\u00A0\u1680\u2000-\u200F\u2028\u2029\u202F\u205F\u2581\u3000\uFEFF\uFFFD]/gm,
      " "
    );
    if (text.includes("\uFF5E")) {
      const parts = text.split("\uFF5E");
      text = parts.map((part) => part.normalize("NFKC")).join("\uFF5E");
    } else {
      text = text.normalize("NFKC");
    }
    return text;
  }
};
var Precompiled_default = Precompiled;
var Sequence = class extends Normalizer_default {
  /**
   * Create a new instance of NormalizerSequence.
   * @param config The configuration object.
   */
  constructor(config) {
    super(config);
    this.normalizers = (config.normalizers ?? []).map(
      (x) => create_normalizer_default(x)
    );
  }
  /**
   * Apply a sequence of Normalizers to the input text.
   * @param text The text to normalize.
   * @returns The normalized text.
   */
  normalize(text) {
    return this.normalizers.reduce((t, normalizer) => {
      return normalizer ? normalizer.normalize(t) : t;
    }, text);
  }
};
var Sequence_default = Sequence;
var Replace = class extends Normalizer_default {
  /**
   * Normalize the input text by replacing the pattern with the content.
   * @param text The input text to be normalized.
   * @returns The normalized text after replacing the pattern with the content.
   */
  normalize(text) {
    const pattern = create_pattern(this.config.pattern ?? {});
    return pattern === null ? text : text.replaceAll(pattern, this.config.content ?? "");
  }
};
var Replace_default = Replace;
var UnicodeNormalizer = class extends Normalizer_default {
  constructor() {
    super(...arguments);
    this.form = "NFC";
  }
  /**
   * Normalize the input text by applying Unicode normalization.
   * @param text The input text to be normalized.
   * @returns The normalized text.
   */
  normalize(text) {
    text = text.normalize(this.form);
    return text;
  }
};
var UnicodeNormalizer_default = UnicodeNormalizer;
var NFC = class extends UnicodeNormalizer_default {
  constructor() {
    super(...arguments);
    this.form = "NFC";
  }
};
var NFC_default = NFC;
var NFD = class extends UnicodeNormalizer_default {
  constructor() {
    super(...arguments);
    this.form = "NFD";
  }
};
var NFD_default = NFD;
var NFKC = class extends UnicodeNormalizer_default {
  constructor() {
    super(...arguments);
    this.form = "NFKC";
  }
};
var NFKC_default = NFKC;
var NFKD = class extends UnicodeNormalizer_default {
  constructor() {
    super(...arguments);
    this.form = "NFKD";
  }
};
var NFKD_default = NFKD;
var Strip = class extends Normalizer_default {
  /**
   * Strip leading and/or trailing whitespace from the input text.
   * @param text The input text.
   * @returns The normalized text.
   */
  normalize(text) {
    if (this.config.strip_left && this.config.strip_right) {
      text = text.trim();
    } else {
      if (this.config.strip_left) {
        text = text.trimStart();
      }
      if (this.config.strip_right) {
        text = text.trimEnd();
      }
    }
    return text;
  }
};
var Strip_default = Strip;
var StripAccents = class extends Normalizer_default {
  /**
   * Remove all accents from the text.
   * @param text The input text.
   * @returns The normalized text without accents.
   */
  normalize(text) {
    return remove_accents(text);
  }
};
var StripAccents_default = StripAccents;
var Lowercase = class extends Normalizer_default {
  /**
   * Lowercases the input string.
   * @param {string} text The text to normalize.
   * @returns {string} The normalized text.
   */
  normalize(text) {
    return text.toLowerCase();
  }
};
var Lowercase_default = Lowercase;
var Prepend = class extends Normalizer_default {
  /**
   * Prepends the input string.
   * @param text The text to normalize.
   * @returns The normalized text.
   */
  normalize(text) {
    text = this.config.prepend + text;
    return text;
  }
};
var Prepend_default = Prepend;
function create_normalizer(config) {
  if (config === null) return null;
  switch (config.type) {
    case "BertNormalizer":
      return new BertNormalizer_default(config);
    case "Precompiled":
      return new Precompiled_default(config);
    case "Sequence":
      return new Sequence_default(config);
    case "Replace":
      return new Replace_default(config);
    case "NFC":
      return new NFC_default(config);
    case "NFD":
      return new NFD_default(config);
    case "NFKC":
      return new NFKC_default(config);
    case "NFKD":
      return new NFKD_default(config);
    case "Strip":
      return new Strip_default(config);
    case "StripAccents":
      return new StripAccents_default(config);
    case "Lowercase":
      return new Lowercase_default(config);
    case "Prepend":
      return new Prepend_default(config);
    default:
      throw new Error(`Unknown Normalizer type: ${config.type}`);
  }
}
var create_normalizer_default = create_normalizer;
var PreTokenizer = class extends Callable_default {
  /**
   * Tokenizes the given text into pre-tokens.
   * @param text The text or array of texts to pre-tokenize.
   * @param options Additional options for the pre-tokenization logic.
   * @returns An array of pre-tokens.
   */
  pre_tokenize(text, options) {
    return (Array.isArray(text) ? text.map((x) => this.pre_tokenize_text(x, options)) : this.pre_tokenize_text(text, options)).flat();
  }
  /**
   * Alias for {@link PreTokenizer#pre_tokenize}.
   * @param text The text or array of texts to pre-tokenize.
   * @param options Additional options for the pre-tokenization logic.
   * @returns An array of pre-tokens.
   */
  _call(text, options) {
    return this.pre_tokenize(text, options);
  }
};
var PreTokenizer_default = PreTokenizer;
var ByteLevel = class extends PreTokenizer_default {
  /**
   * Creates a new instance of the `ByteLevelPreTokenizer` class.
   * @param config The configuration object.
   */
  constructor(config) {
    super();
    this.config = config;
    this.add_prefix_space = this.config.add_prefix_space ?? false;
    this.trim_offsets = this.config.trim_offsets ?? false;
    this.use_regex = this.config.use_regex ?? true;
    this.pattern = new RegExp("'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+", "gu");
    this.byte_encoder = BYTES_TO_UNICODE;
    this.text_encoder = new TextEncoder();
  }
  /**
   * Tokenizes a single piece of text using byte-level tokenization.
   * @param text The text to tokenize.
   * @param options Additional options for the pre-tokenization logic.
   * @returns An array of tokens.
   */
  pre_tokenize_text(text, options) {
    if (this.add_prefix_space && !text.startsWith(" ")) {
      text = " " + text;
    }
    const tokens = this.use_regex ? text.match(this.pattern) || [] : [text];
    return tokens.map(
      (token) => Array.from(
        this.text_encoder.encode(token),
        (byte) => this.byte_encoder[byte]
      ).join("")
    );
  }
};
var ByteLevel_default = ByteLevel;
var Whitespace = class extends PreTokenizer_default {
  /**
   * Pre-tokenizes the input text by splitting it on word boundaries.
   * @param text The text to be pre-tokenized.
   * @param options Additional options for the pre-tokenization logic.
   * @returns An array of tokens produced by splitting the input text on whitespace.
   */
  pre_tokenize_text(text, options) {
    return text.match(/\w+|[^\w\s]+/g) || [];
  }
};
var Whitespace_default = Whitespace;
var Metaspace = class extends PreTokenizer_default {
  /**
   * @param config The configuration object for the MetaspacePreTokenizer.
   */
  constructor(config) {
    super();
    this.replacement = config.replacement ?? "\u2581";
    this.str_rep = config.str_rep || this.replacement;
    this.prepend_scheme = config.prepend_scheme ?? "always";
  }
  /**
   * This method takes a string, replaces spaces with the replacement character,
   * adds a prefix space if requested, and returns a new list of tokens.
   * @param text The text to pre-tokenize.
   * @param options The options for the pre-tokenization.
   * @returns A new list of pre-tokenized tokens.
   */
  pre_tokenize_text(text, options) {
    const { section_index = void 0 } = options ?? {};
    let normalized = text.replaceAll(" ", this.str_rep);
    if (
      // We add a prefix space if:
      //  (1) The normalized token does not already start with the replacement character.
      !normalized.startsWith(this.replacement) && // and (2) either:
      //  (a) prepend_scheme is 'always'
      //  (b) prepend_scheme is 'first' and this is the first section
      (this.prepend_scheme === "always" || this.prepend_scheme === "first" && section_index === 0)
    ) {
      normalized = this.str_rep + normalized;
    }
    return [normalized];
  }
};
var Metaspace_default = Metaspace;
var Split = class extends PreTokenizer_default {
  /**
   * @param config The configuration options for the pre-tokenizer.
   */
  constructor(config) {
    super();
    this.config = config;
    this.pattern = create_pattern(
      this.config.pattern ?? {},
      this.config.invert ?? true
    );
  }
  /**
   * Tokenizes text by splitting it using the given pattern.
   * @param text The text to tokenize.
   * @returns An array of tokens.
   */
  pre_tokenize_text(text) {
    if (this.pattern === null) {
      return [];
    }
    if (this.config.invert) {
      return text.match(this.pattern) || [];
    } else if (this.config.behavior?.toLowerCase() === "removed") {
      return text.split(this.pattern).filter((x) => x);
    } else {
      return regex_split(text, this.pattern);
    }
  }
};
var Split_default = Split;
var Punctuation = class extends PreTokenizer_default {
  /**
   * @param config The configuration options for the pre-tokenizer.
   */
  constructor(config) {
    super();
    this.config = config;
    this.pattern = new RegExp(
      `[^${PUNCTUATION_REGEX}]+|[${PUNCTUATION_REGEX}]+`,
      "gu"
    );
  }
  /**
   * Tokenizes text by splitting it using the given pattern.
   * @param text The text to tokenize.
   * @returns An array of tokens.
   */
  pre_tokenize_text(text) {
    return text.match(this.pattern) || [];
  }
};
var Punctuation_default = Punctuation;
var Digits = class extends PreTokenizer_default {
  /**
   * @param config The configuration options for the pre-tokenizer.
   */
  constructor(config) {
    super();
    this.config = config;
    const digit_pattern = `[^\\d]+|\\d${this.config.individual_digits ? "" : "+"}`;
    this.pattern = new RegExp(digit_pattern, "gu");
  }
  /**
   * Tokenizes text by splitting it using the given pattern.
   * @param text The text to tokenize.
   * @returns An array of tokens.
   */
  pre_tokenize_text(text) {
    return text.match(this.pattern) || [];
  }
};
var Digits_default = Digits;
var BertPreTokenizer = class extends PreTokenizer_default {
  /**
   * A PreTokenizer that splits text into wordpieces using a basic tokenization scheme
   * similar to that used in the original implementation of BERT.
   */
  constructor() {
    super();
    this.pattern = new RegExp(
      `[^\\s${PUNCTUATION_REGEX}]+|[${PUNCTUATION_REGEX}]`,
      "gu"
    );
  }
  /**
   * Tokenizes a single text using the BERT pre-tokenization scheme.
   *
   * @param text The text to tokenize.
   * @param options Additional options for the pre-tokenization logic.
   * @returns An array of tokens.
   */
  pre_tokenize_text(text, options) {
    return text.trim().match(this.pattern) || [];
  }
};
var BertPreTokenizer_default = BertPreTokenizer;
var Replace2 = class extends PreTokenizer_default {
  /**
   * @param config The configuration options for the pre-tokenizer.
   */
  constructor(config) {
    super();
    this.config = config;
    this.pattern = create_pattern(this.config.pattern ?? {});
    this.content = this.config.content ?? "";
  }
  /**
   * Pre-tokenizes the input text by replacing certain characters.
   * @param text The text to be pre-tokenized.
   * @returns An array of tokens produced by replacing certain characters.
   */
  pre_tokenize_text(text) {
    if (this.pattern === null) {
      return [text];
    }
    return [text.replaceAll(this.pattern, this.config.content ?? "")];
  }
};
var Replace_default2 = Replace2;
var Sequence2 = class extends PreTokenizer_default {
  /**
   * Creates an instance of PreTokenizerSequence.
   * @param config The configuration object for the pre-tokenizer sequence.
   */
  constructor(config) {
    super();
    this.tokenizers = (config.pretokenizers ?? []).map(
      (x) => create_pre_tokenizer_default(x)
    );
  }
  /**
   * Applies each pre-tokenizer in the sequence to the input text in turn.
   * @param text The text to pre-tokenize.
   * @param options Additional options for the pre-tokenization logic.
   * @returns The pre-tokenized text.
   */
  pre_tokenize_text(text, options) {
    return this.tokenizers.reduce(
      (pre_tokenized_text, tokenizer) => {
        return tokenizer ? tokenizer.pre_tokenize(pre_tokenized_text, options) : pre_tokenized_text;
      },
      [text]
    );
  }
};
var Sequence_default2 = Sequence2;
var WhitespaceSplit = class extends PreTokenizer_default {
  /**
   * Pre-tokenizes the input text by splitting it on whitespace characters.
   * @param text The text to be pre-tokenized.
   * @returns An array of tokens produced by splitting the input text on whitespace.
   */
  pre_tokenize_text(text) {
    return whitespace_split(text);
  }
};
var WhitespaceSplit_default = WhitespaceSplit;
var FixedLength = class extends PreTokenizer_default {
  /**
   * @param config The configuration options for the pre-tokenizer.
   */
  constructor(config) {
    super();
    this.config = config;
    this._length = config.length;
  }
  /**
   * Pre-tokenizes the input text by splitting it into fixed-length tokens.
   * @param text The text to be pre-tokenized.
   * @returns An array of tokens produced by splitting the input text into fixed-length tokens.
   */
  pre_tokenize_text(text) {
    const tokens = [];
    for (let i = 0; i < text.length; i += this._length) {
      tokens.push(text.slice(i, i + this._length));
    }
    return tokens;
  }
};
var FixedLength_default = FixedLength;
function create_pre_tokenizer(config) {
  if (config === null) return null;
  switch (config.type) {
    case "BertPreTokenizer":
      return new BertPreTokenizer_default();
    case "Sequence":
      return new Sequence_default2(config);
    case "Whitespace":
      return new Whitespace_default();
    case "WhitespaceSplit":
      return new WhitespaceSplit_default();
    case "Metaspace":
      return new Metaspace_default(config);
    case "ByteLevel":
      return new ByteLevel_default(config);
    case "Split":
      return new Split_default(config);
    case "Punctuation":
      return new Punctuation_default(config);
    case "Digits":
      return new Digits_default(config);
    case "Replace":
      return new Replace_default2(config);
    case "FixedLength":
      return new FixedLength_default(config);
    default:
      throw new Error(`Unknown PreTokenizer type: ${config.type}`);
  }
}
var create_pre_tokenizer_default = create_pre_tokenizer;
var TokenizerModel = class extends Callable_default {
  /**
   * Creates a new instance of TokenizerModel.
   * @param config The configuration object for the TokenizerModel.
   */
  constructor(config) {
    super();
    this.config = config;
    this.vocab = [];
    this.tokens_to_ids = /* @__PURE__ */ new Map();
    this.unk_token_id = void 0;
    this.unk_token = void 0;
    this.end_of_word_suffix = void 0;
    this.fuse_unk = this.config.fuse_unk ?? false;
  }
  /**
   * Internal function to call the TokenizerModel instance.
   * @param tokens The tokens to encode.
   * @returns The encoded tokens.
   */
  _call(tokens) {
    let result = this.encode(tokens);
    if (this.fuse_unk) {
      result = fuse_unk(result, this.tokens_to_ids, this.unk_token_id);
    }
    return result;
  }
};
var TokenizerModel_default = TokenizerModel;
var WordPieceTokenizer = class extends TokenizerModel_default {
  /**
   * @param config The configuration object.
   */
  constructor(config) {
    super(config);
    this.max_input_chars_per_word = 100;
    this.tokens_to_ids = object_to_map(config.vocab);
    this.unk_token_id = this.tokens_to_ids.get(config.unk_token);
    this.unk_token = config.unk_token;
    this.max_input_chars_per_word = config.max_input_chars_per_word ?? 100;
    this.vocab = new Array(this.tokens_to_ids.size);
    for (const [key, value] of this.tokens_to_ids) {
      this.vocab[value] = key;
    }
  }
  /**
   * Encodes an array of tokens using WordPiece encoding.
   * @param tokens The tokens to encode.
   * @returns An array of encoded tokens.
   */
  encode(tokens) {
    const output_tokens = [];
    for (const token of tokens) {
      const chars = [...token];
      if (chars.length > this.max_input_chars_per_word) {
        output_tokens.push(this.unk_token);
        continue;
      }
      let is_unknown = false;
      let start = 0;
      const sub_tokens = [];
      while (start < chars.length) {
        let end = chars.length;
        let current_substring = null;
        while (start < end) {
          let substr = chars.slice(start, end).join("");
          if (start > 0) {
            substr = this.config.continuing_subword_prefix + substr;
          }
          if (this.tokens_to_ids.has(substr)) {
            current_substring = substr;
            break;
          }
          --end;
        }
        if (current_substring === null) {
          is_unknown = true;
          break;
        }
        sub_tokens.push(current_substring);
        start = end;
      }
      if (is_unknown) {
        output_tokens.push(this.unk_token);
      } else {
        output_tokens.push(...sub_tokens);
      }
    }
    return output_tokens;
  }
};
var WordPiece_default = WordPieceTokenizer;
var CharTrieNode = class _CharTrieNode {
  /**
   * Create a new CharTrieNode.
   * @param is_leaf Whether the node is a leaf node or not.
   * @param children A map containing the node's children, where the key is a character and the value is a `CharTrieNode`.
   */
  constructor(is_leaf, children) {
    this.is_leaf = is_leaf;
    this.children = children;
  }
  /**
   * Returns a new `CharTrieNode` instance with default values.
   * @returns A new `CharTrieNode` instance with `is_leaf` set to `false` and an empty `children` map.
   */
  static default() {
    return new _CharTrieNode(false, /* @__PURE__ */ new Map());
  }
};
var CharTrie = class {
  constructor() {
    this.root = CharTrieNode.default();
  }
  /**
   * Adds one or more `texts` to the trie.
   * @param texts The strings to add to the trie.
   */
  extend(texts) {
    for (const text of texts) {
      this.push(text);
    }
  }
  /**
   * Adds text to the trie.
   * @param text The string to add to the trie.
   */
  push(text) {
    let node = this.root;
    for (const ch of text) {
      let child = node.children.get(ch);
      if (child === void 0) {
        child = CharTrieNode.default();
        node.children.set(ch, child);
      }
      node = child;
    }
    node.is_leaf = true;
  }
  /**
   * Searches the trie for all strings with a common prefix of `text`.
   * @param text The common prefix to search for.
   * @yields Each string in the trie that has `text` as a prefix.
   */
  *common_prefix_search(text) {
    let node = this.root;
    if (node === void 0) return;
    let prefix = "";
    for (const ch of text) {
      prefix += ch;
      node = node.children.get(ch);
      if (node === void 0) return;
      if (node.is_leaf) {
        yield prefix;
      }
    }
  }
};
var CharTrie_default = CharTrie;
var TokenLatticeNode = class _TokenLatticeNode {
  /**
   * Represents a node in a token lattice for a given sentence.
   * @param token_id The ID of the token associated with this node.
   * @param node_id The ID of this node.
   * @param pos The starting position of the token in the sentence.
   * @param length The length of the token.
   * @param score The score associated with the token.
   */
  constructor(token_id, node_id, pos, length, score) {
    this.token_id = token_id;
    this.node_id = node_id;
    this.pos = pos;
    this.length = length;
    this.score = score;
    this.prev = null;
    this.backtrace_score = 0;
  }
  /**
   * Returns a clone of this node.
   * @returns A clone of this node.
   */
  clone() {
    const n = new _TokenLatticeNode(
      this.token_id,
      this.node_id,
      this.pos,
      this.length,
      this.score
    );
    n.prev = this.prev;
    n.backtrace_score = this.backtrace_score;
    return n;
  }
};
var TokenLattice = class {
  /**
   * Creates a new TokenLattice instance.
   *
   * @param sentence The input sentence to be tokenized.
   * @param bos_token_id The beginning-of-sequence token ID.
   * @param eos_token_id The end-of-sequence token ID.
   */
  constructor(sentence, bos_token_id, eos_token_id) {
    this.chars = Array.from(sentence);
    this.len = this.chars.length;
    this.bos_token_id = bos_token_id;
    this.eos_token_id = eos_token_id;
    this.nodes = [];
    this.begin_nodes = Array.from(
      { length: this.len + 1 },
      () => []
    );
    this.end_nodes = Array.from({ length: this.len + 1 }, () => []);
    const bos = new TokenLatticeNode(this.bos_token_id ?? 0, 0, 0, 0, 0);
    const eos = new TokenLatticeNode(
      this.eos_token_id ?? 0,
      1,
      this.len,
      0,
      0
    );
    this.nodes.push(bos.clone());
    this.nodes.push(eos.clone());
    this.begin_nodes[this.len].push(eos);
    this.end_nodes[0].push(bos);
  }
  /**
   * Inserts a new token node into the token lattice.
   *
   * @param pos The starting position of the token.
   * @param length The length of the token.
   * @param score The score of the token.
   * @param token_id The token ID of the token.
   */
  insert(pos, length, score, token_id) {
    const node_id = this.nodes.length;
    const node = new TokenLatticeNode(token_id, node_id, pos, length, score);
    this.begin_nodes[pos].push(node);
    this.end_nodes[pos + length].push(node);
    this.nodes.push(node);
  }
  /**
   * Implements the Viterbi algorithm to compute the most likely sequence of tokens.
   *
   * @returns The most likely sequence of tokens.
   */
  viterbi() {
    const len2 = this.len;
    let pos = 0;
    while (pos <= len2) {
      if (this.begin_nodes[pos].length == 0) {
        return [];
      }
      for (let rnode of this.begin_nodes[pos]) {
        rnode.prev = null;
        let best_score = 0;
        let best_node = null;
        for (let lnode of this.end_nodes[pos]) {
          const score = lnode.backtrace_score + rnode.score;
          if (best_node === null || score > best_score) {
            best_node = lnode.clone();
            best_score = score;
          }
        }
        if (best_node !== null) {
          rnode.prev = best_node;
          rnode.backtrace_score = best_score;
        } else {
          return [];
        }
      }
      ++pos;
    }
    const results = [];
    const root = this.begin_nodes[len2][0];
    const prev = root.prev;
    if (prev === null) {
      return [];
    }
    let node = prev.clone();
    while (node.prev !== null) {
      results.push(node.clone());
      const n = node.clone();
      node = n.prev.clone();
    }
    results.reverse();
    return results;
  }
  /**
   * Get the text piece for a given node.
   * @param node The node to get the piece for.
   * @returns The array of nodes representing the most likely sequence of tokens.
   */
  piece(node) {
    return this.chars.slice(node.pos, node.pos + node.length).join("");
  }
  /**
   * @returns The most likely sequence of tokens.
   */
  tokens() {
    const nodes = this.viterbi();
    return nodes.map((x) => this.piece(x));
  }
  /**
   * @returns The most likely sequence of token ids.
   */
  token_ids() {
    const nodes = this.viterbi();
    return nodes.map((x) => x.token_id);
  }
};
var TokenLattice_default = TokenLattice;
function min(arr) {
  if (arr.length === 0) throw new Error("Array must not be empty");
  let min_value = arr[0];
  let index_of_min = 0;
  for (let i = 1; i < arr.length; ++i) {
    if (arr[i] < min_value) {
      min_value = arr[i];
      index_of_min = i;
    }
  }
  return [min_value, index_of_min];
}
var Unigram = class extends TokenizerModel_default {
  /**
   * Create a new Unigram tokenizer model.
   * @param config The configuration object for the Unigram model.
   * @param eos_token
   */
  constructor(config, eos_token) {
    super(config);
    const vocab_size = config.vocab.length;
    this.vocab = new Array(vocab_size);
    this.scores = new Array(vocab_size);
    for (let i = 0; i < vocab_size; ++i) {
      [this.vocab[i], this.scores[i]] = config.vocab[i];
    }
    this.unk_token_id = config.unk_id;
    this.unk_token = this.vocab[config.unk_id];
    this.tokens_to_ids = new Map(this.vocab.map((x, i) => [x, i]));
    this.bos_token = " ";
    this.bos_token_id = this.tokens_to_ids.get(this.bos_token);
    this.eos_token = eos_token;
    this.eos_token_id = this.tokens_to_ids.get(this.eos_token);
    this.unk_token = this.vocab[this.unk_token_id];
    this.min_score = min(this.scores)[0];
    this.unk_score = this.min_score - 10;
    this.scores[this.unk_token_id] = this.unk_score;
    this.trie = new CharTrie_default();
    this.trie.extend(this.vocab);
    this.fuse_unk = true;
  }
  /**
   * Populates lattice nodes.
   * @param lattice The token lattice to populate with nodes.
   */
  populate_nodes(lattice) {
    const chars = lattice.chars;
    const mblen = 1;
    let begin_pos = 0;
    while (begin_pos < chars.length) {
      let has_single_node = false;
      const tokens = [];
      const sliced = chars.slice(begin_pos).join("");
      const prefixed_tokens = this.trie.common_prefix_search(sliced);
      for (const token of prefixed_tokens) {
        tokens.push(token);
        const token_id = this.tokens_to_ids.get(token);
        const token_score = this.scores[token_id];
        const n = len(token);
        lattice.insert(begin_pos, n, token_score, token_id);
        if (!has_single_node && n === mblen) {
          has_single_node = true;
        }
      }
      if (!has_single_node) {
        lattice.insert(begin_pos, mblen, this.unk_score, this.unk_token_id);
      }
      begin_pos += mblen;
    }
  }
  /**
   * Encodes an array of tokens into an array of subtokens using the unigram model.
   *
   * @param normalized The normalized string.
   * @returns An array of subtokens obtained by encoding the input tokens using the unigram model.
   */
  tokenize(normalized) {
    const lattice = new TokenLattice_default(
      normalized,
      this.bos_token_id,
      this.eos_token_id
    );
    this.populate_nodes(lattice);
    return lattice.tokens();
  }
  /**
   * Encodes an array of tokens using Unigram encoding.
   * @param tokens The tokens to encode.
   * @returns An array of encoded tokens.
   */
  encode(tokens) {
    const to_return = [];
    for (const token of tokens) {
      const tokenized = this.tokenize(token);
      to_return.push(...tokenized);
    }
    return to_return;
  }
};
var Unigram_default = Unigram;
var PriorityQueue = class {
  /**
   * Create a new PriorityQueue.
   * @param comparator Comparator function to determine priority. Defaults to a MaxHeap.
   * @param max_size Maximum size of the queue. Defaults to Infinity.
   */
  constructor(comparator = (a, b) => a > b, max_size = Infinity) {
    this._heap = [];
    this._comparator = comparator;
    this._max_size = max_size;
  }
  /**
   * The size of the queue
   */
  get size() {
    return this._heap.length;
  }
  /**
   * Check if the queue is empty.
   * @returns `true` if the queue is empty, `false` otherwise.
   */
  is_empty() {
    return this.size === 0;
  }
  /**
   * Return the element with the highest priority in the queue.
   * @returns The highest priority element in the queue.
   */
  peek() {
    return this._heap[0];
  }
  /**
   * Add one or more elements to the queue.
   * @param values The values to push into the queue.
   * @returns The new size of the queue.
   */
  push(...values) {
    return this.extend(values);
  }
  /**
   * Add multiple elements to the queue.
   * @param values The values to push into the queue.
   * @returns The new size of the queue.
   */
  extend(values) {
    for (const value of values) {
      if (this.size < this._max_size) {
        this._heap.push(value);
        this._sift_up();
      } else {
        const smallest = this._smallest();
        if (this._comparator(value, this._heap[smallest])) {
          this._heap[smallest] = value;
          this._sift_up_from(smallest);
        }
      }
    }
    return this.size;
  }
  /**
   * Remove and return the element with the highest priority in the queue.
   * @returns The element with the highest priority in the queue.
   */
  pop() {
    const popped_value = this.peek();
    const bottom = this.size - 1;
    if (bottom > 0) {
      this._swap(0, bottom);
    }
    this._heap.pop();
    this._sift_down();
    return popped_value;
  }
  /**
   * Replace the element with the highest priority in the queue with a new value.
   * @param value The new value.
   * @returns The replaced value.
   */
  replace(value) {
    const replaced_value = this.peek();
    this._heap[0] = value;
    this._sift_down();
    return replaced_value;
  }
  /**
   * Compute the index for the parent of the node at index `i`.
   * @param i The index of the node to get the parent of.
   * @returns The index of the parent node.
   * @private
   */
  _parent(i) {
    return (i + 1 >>> 1) - 1;
  }
  /**
   * Compute the index for the left child of the node at index `i`.
   * @param i The index of the node to get the left child of.
   * @returns The index of the left child.
   * @private
   */
  _left(i) {
    return (i << 1) + 1;
  }
  /**
   * Compute the index for the right child of the node at index `i`.
   * @param i The index of the node to get the right child of.
   * @returns The index of the right child.
   * @private
   */
  _right(i) {
    return i + 1 << 1;
  }
  /**
   * Check if the element at index `i` is greater than the element at index `j`.
   * @param i The index of the first element to compare.
   * @param j The index of the second element to compare.
   * @returns `true` if the element at index `i` is greater than the element at index `j`, `false` otherwise.
   * @private
   */
  _greater(i, j2) {
    return this._comparator(this._heap[i], this._heap[j2]);
  }
  /**
   * Swap the elements at indices `i` and `j`.
   * @param i The index of the first element to swap.
   * @param j The index of the second element to swap.
   * @private
   */
  _swap(i, j2) {
    const temp = this._heap[i];
    this._heap[i] = this._heap[j2];
    this._heap[j2] = temp;
  }
  /**
   * Maintain the heap property by updating positions in the heap,
   * starting at the last element and moving up the heap.
   * @private
   */
  _sift_up() {
    this._sift_up_from(this.size - 1);
  }
  /**
   * Helper function to sift up from a given node.
   * @param node The index of the node to start sifting up from.
   */
  _sift_up_from(node) {
    while (node > 0 && this._greater(node, this._parent(node))) {
      this._swap(node, this._parent(node));
      node = this._parent(node);
    }
  }
  /**
   * Maintain the heap property by updating positions in the heap,
   * starting at the first element and moving down the heap.
   * @private
   */
  _sift_down() {
    let node = 0;
    while (this._left(node) < this.size && this._greater(this._left(node), node) || this._right(node) < this.size && this._greater(this._right(node), node)) {
      const max_child = this._right(node) < this.size && this._greater(this._right(node), this._left(node)) ? this._right(node) : this._left(node);
      this._swap(node, max_child);
      node = max_child;
    }
  }
  /**
   * Get the index of the smallest element in the heap. Since we use an array-based heap,
   * the index can be computed without needing to traverse the heap.
   * @private
   */
  _smallest() {
    return 2 ** Math.floor(Math.log2(this.size)) - 1;
  }
};
var PriorityQueue_default = PriorityQueue;
var LRUCache = class {
  /**
   * Creates an LRUCache instance.
   * @param capacity The maximum number of items the cache can hold.
   */
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = /* @__PURE__ */ new Map();
  }
  /**
   * Retrieves the value associated with the given key and marks the key as recently used.
   * @param key The key to retrieve.
   * @returns The value associated with the key, or undefined if the key does not exist.
   */
  get(key) {
    if (!this.cache.has(key)) return void 0;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  /**
   * Inserts or updates the key-value pair in the cache.
   * If the key already exists, it is updated and marked as recently used.
   * If the cache exceeds its capacity, the least recently used item is evicted.
   * @param key The key to add or update.
   * @param value The value to associate with the key.
   */
  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    if (this.cache.size > this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }
  /**
   * Clears the cache.
   */
  clear() {
    this.cache.clear();
  }
};
var LRUCache_default = LRUCache;
var BPE = class extends TokenizerModel_default {
  /**
   * Create a BPE instance.
   * @param config The configuration object for BPE.
   */
  constructor(config) {
    super(config);
    this.tokens_to_ids = object_to_map(config.vocab);
    this.unk_token_id = this.tokens_to_ids.get(config.unk_token);
    this.unk_token = config.unk_token;
    this.vocab = new Array(this.tokens_to_ids.size);
    for (const [key, value] of this.tokens_to_ids) {
      this.vocab[value] = key;
    }
    const use_new_merge_format = Array.isArray(config.merges[0]);
    this.merges = use_new_merge_format ? config.merges : config.merges.map(
      (x) => x.split(" ", 2)
    );
    this.bpe_ranks = new Map(this.merges.map((x, i) => [JSON.stringify(x), i]));
    this.end_of_word_suffix = config.end_of_word_suffix;
    this.continuing_subword_suffix = config.continuing_subword_suffix ?? null;
    this.byte_fallback = this.config.byte_fallback ?? false;
    if (this.byte_fallback) {
      this.text_encoder = new TextEncoder();
    }
    this.ignore_merges = this.config.ignore_merges ?? false;
    this.max_length_to_cache = 256;
    this.cache_capacity = 1e4;
    this.cache = new LRUCache_default(this.cache_capacity);
  }
  /**
   * Clears the cache.
   */
  clear_cache() {
    this.cache.clear();
  }
  /**
   * Apply Byte-Pair-Encoding (BPE) to a given token. Efficient heap-based priority
   * queue implementation adapted from https://github.com/belladoreai/llama-tokenizer-js.
   * @param token The token to encode.
   * @returns The BPE encoded tokens.
   */
  bpe(token) {
    if (token.length === 0) {
      return [];
    }
    const cached = this.cache.get(token);
    if (cached !== void 0) {
      return cached;
    }
    const word = Array.from(token);
    if (this.end_of_word_suffix) {
      word[word.length - 1] += this.end_of_word_suffix;
    }
    let result = [];
    if (word.length > 1) {
      const queue = new PriorityQueue_default((a, b) => a.score < b.score);
      let starting_node = {
        token: word[0],
        bias: 0,
        prev: null,
        next: null
      };
      let previous_node = starting_node;
      for (let i = 1; i < word.length; ++i) {
        const current_node = {
          bias: i / word.length,
          // Add fractional component to break ties
          token: word[i],
          prev: previous_node,
          next: null
        };
        previous_node.next = current_node;
        this.add_node(queue, previous_node);
        previous_node = current_node;
      }
      while (!queue.is_empty()) {
        const node = queue.pop();
        if (node.deleted || !node.next || node.next.deleted) continue;
        node.deleted = true;
        node.next.deleted = true;
        if (node.prev) {
          const new_previous_node = { ...node.prev };
          node.prev.deleted = true;
          node.prev = new_previous_node;
          if (new_previous_node.prev) {
            new_previous_node.prev.next = new_previous_node;
          } else {
            starting_node = new_previous_node;
          }
        }
        const merged = {
          token: node.token + node.next.token,
          bias: node.bias,
          prev: node.prev,
          next: node.next.next
        };
        if (merged.prev) {
          merged.prev.next = merged;
          this.add_node(queue, merged.prev);
        } else {
          starting_node = merged;
        }
        if (merged.next) {
          merged.next.prev = merged;
          this.add_node(queue, merged);
        }
      }
      for (let current_node = starting_node; current_node !== null; current_node = current_node.next) {
        result.push(current_node.token);
      }
    } else {
      result = word;
    }
    if (this.continuing_subword_suffix) {
      for (let i = 0; i < result.length - 1; ++i) {
        result[i] += this.continuing_subword_suffix;
      }
    }
    if (token.length < this.max_length_to_cache) {
      this.cache.put(token, result);
    }
    return result;
  }
  /**
   * Helper function to add a node to the priority queue.
   * @param queue
   * @param node
   */
  add_node(queue, node) {
    const rank = this.bpe_ranks.get(
      JSON.stringify([node.token, node.next.token])
    );
    if (rank !== void 0) {
      node.score = rank + node.bias;
      queue.push(node);
    }
  }
  /**
   * Encodes the input sequence of tokens using the BPE algorithm and returns the resulting subword tokens.
   * @param tokens The input sequence of tokens to encode.
   * @returns The resulting subword tokens after applying the BPE algorithm to the input sequence of tokens.
   */
  encode(tokens) {
    const output_tokens = [];
    for (const token of tokens) {
      if (this.ignore_merges && this.tokens_to_ids.has(token)) {
        output_tokens.push(token);
        continue;
      }
      const bpe_token_list = this.bpe(token);
      for (const t of bpe_token_list) {
        if (this.tokens_to_ids.has(t)) {
          output_tokens.push(t);
        } else if (this.byte_fallback) {
          const byte_tokens = Array.from(this.text_encoder.encode(t)).map(
            (x) => `<0x${x.toString(16).toUpperCase().padStart(2, "0")}>`
          );
          if (byte_tokens.every((x) => this.tokens_to_ids.has(x))) {
            output_tokens.push(...byte_tokens);
          } else if (this.unk_token != null) {
            output_tokens.push(this.unk_token);
          }
        } else if (this.unk_token != null) {
          output_tokens.push(this.unk_token);
        }
      }
    }
    return output_tokens;
  }
};
var BPE_default = BPE;
var Legacy = class extends TokenizerModel_default {
  /**
   * Create a Legacy tokenizer model instance.
   * @param config The configuration object for Legacy tokenizer model.
   * @param more_config Additional configuration object for the Legacy tokenizer model.
   */
  constructor(config, more_config) {
    super(config);
    const vocab = config.vocab;
    this.tokens_to_ids = object_to_map(
      more_config.target_lang ? vocab[more_config.target_lang] : vocab
    );
    this.bos_token = more_config.bos_token;
    this.bos_token_id = this.tokens_to_ids.get(this.bos_token);
    this.eos_token = more_config.eos_token;
    this.eos_token_id = this.tokens_to_ids.get(this.eos_token);
    this.pad_token = more_config.pad_token;
    this.pad_token_id = this.tokens_to_ids.get(this.pad_token);
    this.unk_token = more_config.unk_token;
    this.unk_token_id = this.tokens_to_ids.get(this.unk_token);
    this.vocab = new Array(this.tokens_to_ids.size);
    for (const [key, value] of this.tokens_to_ids) {
      this.vocab[value] = key;
    }
  }
  encode(tokens) {
    return tokens;
  }
};
var Legacy_default = Legacy;
function create_tokenizer_model(model_config, config) {
  switch (model_config.type) {
    case "WordPiece":
      return new WordPiece_default(model_config);
    case "Unigram":
      return new Unigram_default(model_config, config.eos_token);
    case "BPE":
      return new BPE_default(model_config);
    default:
      if (model_config.vocab) {
        if (Array.isArray(model_config.vocab)) {
          return new Unigram_default(model_config, config.eos_token);
        } else if (Object.hasOwn(model_config, "continuing_subword_prefix") && Object.hasOwn(model_config, "unk_token")) {
          if (Object.hasOwn(model_config, "merges")) {
            return new BPE_default(model_config);
          } else {
            return new WordPiece_default(model_config);
          }
        } else {
          return new Legacy_default(model_config, {
            target_lang: config.target_lang,
            bos_token: config.bos_token,
            eos_token: config.eos_token,
            pad_token: config.pad_token,
            unk_token: config.unk_token
          });
        }
      }
      throw new Error(
        `Unknown TokenizerModel type: ${model_config?.type}`
      );
  }
}
var create_tokenizer_model_default = create_tokenizer_model;
var PostProcessor = class extends Callable_default {
  /**
   * @param config The configuration for the post-processor.
   */
  constructor(config) {
    super();
    this.config = config;
  }
  /**
   * Alias for {@link PostProcessor#post_process}.
   * @param tokens The text or array of texts to post-process.
   * @param args Additional arguments required by the post-processing logic.
   * @returns The post-processed tokens.
   */
  _call(tokens, ...args) {
    return this.post_process(tokens, ...args);
  }
};
var PostProcessor_default = PostProcessor;
var TemplateProcessing = class extends PostProcessor_default {
  /**
   * Replaces special tokens in the template with actual tokens.
   * @param tokens The list of tokens for the first sequence.
   * @param tokens_pair The list of tokens for the second sequence (optional).
   * @param add_special_tokens Whether to add the special tokens to the beginning and end of the input.
   * @returns An object containing the list of tokens with the special tokens replaced with actual tokens.
   */
  post_process(tokens, tokens_pair = null, add_special_tokens = true) {
    const type = tokens_pair === null ? this.config.single : this.config.pair;
    let processed_tokens = [];
    let types = [];
    for (const item of type) {
      if ("SpecialToken" in item) {
        if (add_special_tokens) {
          processed_tokens.push(item.SpecialToken.id);
          types.push(item.SpecialToken.type_id);
        }
      } else if ("Sequence" in item) {
        if (item.Sequence.id === "A") {
          processed_tokens = merge_arrays(processed_tokens, tokens);
          types = merge_arrays(
            types,
            new Array(tokens.length).fill(item.Sequence.type_id)
          );
        } else if (item.Sequence.id === "B") {
          processed_tokens = merge_arrays(processed_tokens, tokens_pair);
          types = merge_arrays(
            types,
            new Array(tokens_pair.length).fill(item.Sequence.type_id)
          );
        }
      }
    }
    return { tokens: processed_tokens, token_type_ids: types };
  }
};
var TemplateProcessing_default = TemplateProcessing;
var ByteLevel2 = class extends PostProcessor_default {
  /**
   * Post process the given tokens.
   * @param tokens The list of tokens for the first sequence.
   * @param tokens_pair The list of tokens for the second sequence (optional).
   * @returns An object containing the post-processed tokens.
   */
  post_process(tokens, tokens_pair = null) {
    return { tokens, tokens_pair };
  }
};
var ByteLevel_default2 = ByteLevel2;
var BertProcessing = class extends PostProcessor_default {
  /**
   * @param config The configuration for the post-processor.
   * @param config.cls The special tokens to add to the beginning of the input.
   * @param config.sep The special tokens to add to the end of the input.
   */
  constructor(config) {
    super(config);
    this.sep = config.sep;
    this.cls = config.cls;
  }
  /**
   * Adds the special tokens to the beginning and end of the input.
   * @param tokens The input tokens.
   * @param tokens_pair An optional second set of input tokens.
   * @param add_special_tokens Whether to add the special tokens to the beginning and end of the input.
   * @returns The post-processed tokens with the special tokens added to the beginning and end.
   */
  post_process(tokens, tokens_pair = null, add_special_tokens = true) {
    if (add_special_tokens) {
      tokens = merge_arrays([this.cls[0]], tokens, [this.sep[0]]);
    }
    let token_type_ids = new Array(tokens.length).fill(0);
    if (tokens_pair) {
      const middle = [];
      const after = add_special_tokens ? [this.sep[0]] : [];
      tokens = merge_arrays(tokens, middle, tokens_pair, after);
      token_type_ids = merge_arrays(
        token_type_ids,
        new Array(tokens_pair.length + middle.length + after.length).fill(1)
      );
    }
    return { tokens, token_type_ids };
  }
};
var BertProcessing_default = BertProcessing;
var RobertaProcessing = class extends PostProcessor_default {
  /**
   * @param config The configuration for the post-processor.
   * @param config.cls The special tokens to add to the beginning of the input.
   * @param config.sep The special tokens to add to the end of the input.
   */
  constructor(config) {
    super(config);
    this.sep = config.sep;
    this.cls = config.cls;
  }
  /**
   * Adds the special tokens to the beginning and end of the input.
   * @param tokens The input tokens.
   * @param tokens_pair An optional second set of input tokens.
   * @param add_special_tokens Whether to add the special tokens to the beginning and end of the input.
   * @returns The post-processed tokens with the special tokens added to the beginning and end.
   */
  post_process(tokens, tokens_pair, add_special_tokens = true) {
    if (add_special_tokens) {
      tokens = merge_arrays([this.cls[0]], tokens, [this.sep[0]]);
    }
    let token_type_ids = new Array(tokens.length).fill(0);
    if (tokens_pair) {
      const middle = add_special_tokens ? [this.sep[0]] : [];
      const after = add_special_tokens ? [this.sep[0]] : [];
      tokens = merge_arrays(tokens, middle, tokens_pair, after);
      token_type_ids = merge_arrays(
        token_type_ids,
        new Array(tokens_pair.length + middle.length + after.length).fill(1)
      );
    }
    return { tokens, token_type_ids };
  }
};
var RobertaProcessing_default = RobertaProcessing;
var Sequence3 = class extends PostProcessor_default {
  /**
   * Creates a new instance of Sequence post-processor.
   * @param config The configuration object.
   */
  constructor(config) {
    super(config);
    this.processors = (config.processors ?? []).map((x) => create_post_processor_default(x));
  }
  /**
   * Post process the given tokens.
   * @param tokens The list of tokens for the first sequence.
   * @param tokens_pair The list of tokens for the second sequence (optional).
   * @param add_special_tokens Whether to add the special tokens to the beginning and end of the input.
   * @returns An object containing the post-processed tokens.
   */
  post_process(tokens, tokens_pair = null, add_special_tokens = true) {
    let processed_tokens = { tokens, tokens_pair };
    for (const processor of this.processors) {
      processed_tokens = processor.post_process(
        processed_tokens.tokens,
        processed_tokens.tokens_pair,
        add_special_tokens
      );
    }
    return processed_tokens;
  }
};
var Sequence_default3 = Sequence3;
function create_post_processor(config) {
  if (config === null) return null;
  switch (config.type) {
    case "TemplateProcessing":
      return new TemplateProcessing_default(config);
    case "ByteLevel":
      return new ByteLevel_default2(config);
    case "BertProcessing":
      return new BertProcessing_default(config);
    case "RobertaProcessing":
      return new RobertaProcessing_default(config);
    case "Sequence":
      return new Sequence_default3(config);
    default:
      throw new Error(`Unknown PostProcessor type: ${config.type}`);
  }
}
var create_post_processor_default = create_post_processor;
var Decoder = class extends Callable_default {
  /**
   * Creates an instance of `Decoder`.
   * @param config The configuration object.
   **/
  constructor(config) {
    super();
    this.config = config;
    this.added_tokens = [];
    this.end_of_word_suffix = null;
    this.trim_offsets = "trim_offsets" in config ? config.trim_offsets : false;
  }
  /**
   * Calls the `decode` method.
   *
   * @param tokens The list of tokens.
   * @returns The decoded string.
   */
  _call(tokens) {
    return this.decode(tokens);
  }
  /**
   * Decodes a list of tokens.
   * @param tokens The list of tokens.
   * @returns The decoded string.
   */
  decode(tokens) {
    return this.decode_chain(tokens).join("");
  }
};
var Decoder_default = Decoder;
var ByteLevel3 = class extends Decoder_default {
  /**
   * Create a `ByteLevelDecoder` object.
   */
  constructor(config) {
    super(config);
    this.byte_decoder = UNICODE_TO_BYTES;
    this.text_decoder = new TextDecoder("utf-8", {
      fatal: false,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      ignoreBOM: true
    });
    this.end_of_word_suffix = null;
  }
  /**
   * Convert an array of tokens to string by decoding each byte.
   * @param tokens Array of tokens to be decoded.
   * @returns The decoded string.
   */
  convert_tokens_to_string(tokens) {
    const text = tokens.join("");
    const byte_array = new Uint8Array(
      [...text].map((c) => this.byte_decoder[c])
    );
    return this.text_decoder.decode(byte_array);
  }
  decode_chain(tokens) {
    const sub_texts = [];
    let current_sub_text = [];
    for (const token of tokens) {
      if (this.added_tokens.find((x) => x.content === token) !== void 0) {
        if (current_sub_text.length > 0) {
          sub_texts.push(this.convert_tokens_to_string(current_sub_text));
          current_sub_text = [];
        }
        sub_texts.push(token);
      } else {
        current_sub_text.push(token);
      }
    }
    if (current_sub_text.length > 0) {
      sub_texts.push(this.convert_tokens_to_string(current_sub_text));
    }
    return sub_texts;
  }
};
var ByteLevel_default3 = ByteLevel3;
var WordPiece = class extends Decoder_default {
  /**
   * Creates a new instance of WordPieceDecoder.
   * @param config The configuration object.
   */
  constructor(config) {
    super(config);
    this.cleanup = config.cleanup;
  }
  decode_chain(tokens) {
    return tokens.map((token, i) => {
      if (i !== 0) {
        const prefix = this.config.prefix;
        if (prefix && token.startsWith(prefix)) {
          token = token.replace(prefix, "");
        } else {
          token = " " + token;
        }
      }
      if (this.cleanup) {
        token = clean_up_tokenization(token);
      }
      return token;
    });
  }
};
var WordPiece_default2 = WordPiece;
var Metaspace2 = class extends Decoder_default {
  /**
   * Constructs a new MetaspaceDecoder object.
   * @param config The configuration object for the MetaspaceDecoder.
   */
  constructor(config) {
    super(config);
    this.replacement = config.replacement ?? "\u2581";
  }
  decode_chain(tokens) {
    const result = [];
    for (let i = 0; i < tokens.length; ++i) {
      let normalized = tokens[i].replaceAll(this.replacement, " ");
      if (i == 0 && normalized.startsWith(" ")) {
        normalized = normalized.substring(1);
      }
      result.push(normalized);
    }
    return result;
  }
};
var Metaspace_default2 = Metaspace2;
var BPE2 = class extends Decoder_default {
  constructor(config) {
    super(config);
    this.suffix = config.suffix ?? "";
  }
  decode_chain(tokens) {
    return tokens.map((token, i) => {
      return token.replaceAll(this.suffix, i === tokens.length - 1 ? "" : " ");
    });
  }
};
var BPE_default2 = BPE2;
var CTC = class extends Decoder_default {
  constructor(config) {
    super(config);
    this.pad_token = config.pad_token ?? "";
    this.word_delimiter_token = config.word_delimiter_token ?? "";
    this.cleanup = config.cleanup;
  }
  /**
   * Converts a connectionist-temporal-classification (CTC) output tokens into a single string.
   * @param tokens Array of tokens to be decoded.
   * @returns The decoded string.
   */
  convert_tokens_to_string(tokens) {
    if (tokens.length === 0) return "";
    const grouped_tokens = [tokens[0]];
    for (let i = 1; i < tokens.length; ++i) {
      if (tokens[i] !== grouped_tokens.at(-1)) {
        grouped_tokens.push(tokens[i]);
      }
    }
    const filtered_tokens = grouped_tokens.filter(
      (token) => token !== this.pad_token
    );
    let text = filtered_tokens.join("");
    if (this.cleanup) {
      text = clean_up_tokenization(text).replaceAll(this.word_delimiter_token, " ").trim();
    }
    return text;
  }
  decode_chain(tokens) {
    return [this.convert_tokens_to_string(tokens)];
  }
};
var CTC_default = CTC;
var Sequence4 = class extends Decoder_default {
  /**
   * Creates a new instance of DecoderSequence.
   * @param config The configuration object.
   */
  constructor(config) {
    super(config);
    this.decoders = (config.decoders ?? []).map((x) => create_decoder_default(x));
  }
  decode_chain(tokens) {
    return this.decoders.reduce((toks, decoder) => {
      return decoder.decode_chain(toks);
    }, tokens);
  }
};
var Sequence_default4 = Sequence4;
var Replace3 = class extends Decoder_default {
  decode_chain(tokens) {
    const pattern = create_pattern(this.config.pattern);
    const content = this.config.content ?? "";
    return pattern === null ? tokens : tokens.map((token) => token.replaceAll(pattern, content));
  }
};
var Replace_default3 = Replace3;
var Fuse = class extends Decoder_default {
  decode_chain(tokens) {
    return [tokens.join("")];
  }
};
var Fuse_default = Fuse;
var Strip2 = class extends Decoder_default {
  constructor(config) {
    super(config);
    this.content = config.content ?? "";
    this.start = config.start ?? 0;
    this.stop = config.stop ?? 0;
  }
  decode_chain(tokens) {
    return tokens.map((token) => {
      let start_cut = 0;
      for (let i = 0; i < this.start; ++i) {
        if (token[i] === this.content) {
          start_cut = i + 1;
          continue;
        } else {
          break;
        }
      }
      let stop_cut = token.length;
      for (let i = 0; i < this.stop; ++i) {
        const index = token.length - i - 1;
        if (token[index] === this.content) {
          stop_cut = index;
          continue;
        } else {
          break;
        }
      }
      return token.slice(start_cut, stop_cut);
    });
  }
};
var Strip_default2 = Strip2;
var ByteFallback = class extends Decoder_default {
  constructor(config) {
    super(config);
    this.text_decoder = new TextDecoder();
  }
  decode_chain(tokens) {
    const new_tokens = [];
    let previous_byte_tokens = [];
    for (const token of tokens) {
      let bytes = null;
      if (token.length === 6 && token.startsWith("<0x") && token.endsWith(">")) {
        const byte = parseInt(token.slice(3, 5), 16);
        if (!isNaN(byte)) {
          bytes = byte;
        }
      }
      if (bytes !== null) {
        previous_byte_tokens.push(bytes);
      } else {
        if (previous_byte_tokens.length > 0) {
          const string = this.text_decoder.decode(
            Uint8Array.from(previous_byte_tokens)
          );
          new_tokens.push(string);
          previous_byte_tokens = [];
        }
        new_tokens.push(token);
      }
    }
    if (previous_byte_tokens.length > 0) {
      const string = this.text_decoder.decode(
        Uint8Array.from(previous_byte_tokens)
      );
      new_tokens.push(string);
      previous_byte_tokens = [];
    }
    return new_tokens;
  }
};
var ByteFallback_default = ByteFallback;
function create_decoder(config) {
  if (config === null) return null;
  switch (config.type) {
    case "ByteLevel":
      return new ByteLevel_default3(config);
    case "WordPiece":
      return new WordPiece_default2(config);
    case "Metaspace":
      return new Metaspace_default2(config);
    case "BPEDecoder":
      return new BPE_default2(config);
    case "CTC":
      return new CTC_default(config);
    case "Sequence":
      return new Sequence_default4(config);
    case "Replace":
      return new Replace_default3(config);
    case "Fuse":
      return new Fuse_default(config);
    case "Strip":
      return new Strip_default2(config);
    case "ByteFallback":
      return new ByteFallback_default(config);
    default:
      throw new Error(`Unknown Decoder type: ${config.type}`);
  }
}
var create_decoder_default = create_decoder;
var Tokenizer = class {
  constructor(tokenizer, config) {
    const tokenizer_error = validate_object(tokenizer, "Tokenizer", [
      "model",
      "decoder",
      "post_processor",
      "pre_tokenizer",
      "normalizer"
    ]);
    if (tokenizer_error) {
      throw new Error(tokenizer_error);
    }
    const config_error = validate_object(config, "Config");
    if (config_error) {
      throw new Error(config_error);
    }
    this.tokenizer = tokenizer;
    this.config = config;
    this.normalizer = create_normalizer_default(this.tokenizer.normalizer);
    this.pre_tokenizer = create_pre_tokenizer_default(this.tokenizer.pre_tokenizer);
    this.model = create_tokenizer_model_default(this.tokenizer.model, this.config);
    this.post_processor = create_post_processor_default(this.tokenizer.post_processor);
    this.decoder = create_decoder_default(this.tokenizer.decoder);
    this.special_tokens = [];
    this.all_special_ids = [];
    this.added_tokens = [];
    const unnormalized_contents = [];
    const normalized_contents = [];
    this.added_tokens_map = /* @__PURE__ */ new Map();
    for (const added_token of this.tokenizer.added_tokens) {
      const token = new AddedToken_default(added_token);
      this.added_tokens.push(token);
      this.model.tokens_to_ids.set(token.content, token.id);
      this.model.vocab[token.id] = token.content;
      if (token.special) {
        this.special_tokens.push(token.content);
        this.all_special_ids.push(token.id);
      }
      this.added_tokens_map.set(token.content, token);
      if (token.normalized && this.normalizer !== null) {
        const normalized_content = this.normalizer(token.content);
        normalized_contents.push(normalized_content);
        this.added_tokens_map.set(normalized_content, token);
      } else {
        unnormalized_contents.push(token.content);
      }
    }
    (this.config.additional_special_tokens ?? []).forEach((token) => {
      if (!this.special_tokens.includes(token)) this.special_tokens.push(token);
    });
    if (this.decoder) {
      this.decoder.added_tokens = this.added_tokens;
      this.decoder.end_of_word_suffix = this.model.end_of_word_suffix;
    }
    this.splitter_unnormalized = new DictionarySplitter_default(unnormalized_contents);
    this.splitter_normalized = new DictionarySplitter_default(normalized_contents);
    this.remove_space = this.config.remove_space;
    this.clean_up_tokenization_spaces = this.config.clean_up_tokenization_spaces ?? true;
    this.do_lowercase_and_remove_accent = this.config.do_lowercase_and_remove_accent ?? false;
  }
  // Implementation
  encode(text, {
    text_pair = null,
    add_special_tokens = true,
    return_token_type_ids = null
  } = {}) {
    const { tokens, token_type_ids } = this.tokenize_helper(text, {
      text_pair,
      add_special_tokens
    });
    const input_ids = tokens.map(
      (t) => this.added_tokens_map.get(t)?.id ?? this.model.tokens_to_ids.get(t) ?? this.model.unk_token_id
    );
    const result = {
      ids: input_ids,
      tokens,
      attention_mask: new Array(input_ids.length).fill(1)
    };
    if (return_token_type_ids && token_type_ids) {
      result.token_type_ids = token_type_ids;
    }
    return result;
  }
  decode(token_ids, options = {}) {
    if (!Array.isArray(token_ids) || token_ids.length === 0 || !is_integral_number(token_ids[0])) {
      throw Error("token_ids must be a non-empty array of integers.");
    }
    let tokens = token_ids.map(
      (i) => this.model.vocab[Number(i)] ?? this.model.unk_token
    );
    if (options.skip_special_tokens) {
      tokens = tokens.filter((x) => !this.special_tokens.includes(x));
    }
    let decoded = this.decoder ? this.decoder(tokens) : tokens.join(" ");
    if (this.decoder && this.decoder.end_of_word_suffix) {
      decoded = decoded.replaceAll(this.decoder.end_of_word_suffix, " ");
      if (options.skip_special_tokens) {
        decoded = decoded.trim();
      }
    }
    if (options.clean_up_tokenization_spaces ?? this.clean_up_tokenization_spaces) {
      decoded = clean_up_tokenization(decoded);
    }
    return decoded;
  }
  /**
   * Converts a string into a sequence of tokens.
   * @param text The sequence to be encoded.
   * @param options An optional object containing the following properties:
   * @returns The list of tokens.
   */
  tokenize(text, { text_pair = null, add_special_tokens = false } = {}) {
    return this.tokenize_helper(text, { text_pair, add_special_tokens }).tokens;
  }
  encode_text(text) {
    if (text === null) {
      return null;
    }
    const sections = this.splitter_unnormalized.split(text);
    sections.forEach((section, i) => {
      const added_token = this.added_tokens_map.get(section);
      if (added_token) {
        if (added_token.lstrip && i > 0) {
          sections[i - 1] = sections[i - 1].trimEnd();
        }
        if (added_token.rstrip && i < sections.length - 1) {
          sections[i + 1] = sections[i + 1].trimStart();
        }
      }
    });
    return sections.flatMap((processed_text, section_index) => {
      if (processed_text.length === 0) {
        return [];
      }
      if (this.added_tokens_map.has(processed_text)) {
        return [processed_text];
      }
      if (this.remove_space === true) {
        processed_text = processed_text.trim().split(/\s+/).join(" ");
      }
      if (this.do_lowercase_and_remove_accent) {
        processed_text = lowercase_and_remove_accents(processed_text);
      }
      if (this.normalizer !== null) {
        processed_text = this.normalizer(processed_text);
      }
      if (processed_text.length === 0) {
        return [];
      }
      const subsections = this.splitter_normalized.split(processed_text);
      subsections.forEach((subsection, j2) => {
        const added_token = this.added_tokens_map.get(subsection);
        if (added_token) {
          if (added_token.lstrip && j2 > 0) {
            subsections[j2 - 1] = subsections[j2 - 1].trimEnd();
          }
          if (added_token.rstrip && j2 < subsections.length - 1) {
            subsections[j2 + 1] = subsections[j2 + 1].trimStart();
          }
        }
      });
      return subsections.flatMap((subsection) => {
        if (subsection.length === 0) {
          return [];
        }
        if (this.added_tokens_map.has(subsection)) {
          return [subsection];
        }
        const section_tokens = this.pre_tokenizer !== null ? this.pre_tokenizer(subsection, {
          section_index
        }) : [subsection];
        return this.model(section_tokens);
      });
    });
  }
  tokenize_helper(text, { text_pair = null, add_special_tokens = true }) {
    const tokens1 = this.encode_text(text);
    const tokens2 = this.encode_text(text_pair || null);
    return this.post_processor ? this.post_processor(tokens1, tokens2, add_special_tokens) : { tokens: merge_arrays(tokens1 ?? [], tokens2 ?? []) };
  }
  /**
   * Converts a token string to its corresponding token ID.
   * @param token The token string to convert.
   * @returns The token ID, or undefined if the token is not in the vocabulary.
   */
  token_to_id(token) {
    return this.model.tokens_to_ids.get(token);
  }
  /**
   * Converts a token ID to its corresponding token string.
   * @param id The token ID to convert.
   * @returns The token string, or undefined if the ID is not in the vocabulary.
   */
  id_to_token(id) {
    return this.model.vocab[id];
  }
  /**
   * Returns a mapping of token IDs to AddedToken objects for all added tokens.
   * @returns A Map where keys are token IDs and values are AddedToken objects.
   */
  get_added_tokens_decoder() {
    const decoder = /* @__PURE__ */ new Map();
    for (const token of this.added_tokens) {
      decoder.set(token.id, token);
    }
    return decoder;
  }
  /**
   * Get the underlying vocabulary
   * @param with_added_tokens Whether to include the added tokens
   * @returns The vocabulary
   */
  get_vocab(with_added_tokens = true) {
    const vocab = /* @__PURE__ */ new Map();
    for (let i = 0; i < this.model.vocab.length; ++i) {
      const token = this.model.vocab[i];
      if (with_added_tokens || !this.added_tokens_map.has(token)) {
        vocab.set(token, i);
      }
    }
    return vocab;
  }
};
var Tokenizer_default = Tokenizer;

// src/tokenizer.ts
var MAX_INPUT_CHARS = 2e3;
var MAX_LENGTH = 512;
function loadTokenizer(model) {
  const tokenizerFile = model.files.get("tokenizer.json");
  if (!tokenizerFile) throw new Error("model set missing tokenizer.json");
  const tokenizerConfigFile = model.files.get("tokenizer_config.json");
  const tokenizerJson = JSON.parse(fs.readFileSync(tokenizerFile.path, "utf-8"));
  const configJson = tokenizerConfigFile ? JSON.parse(fs.readFileSync(tokenizerConfigFile.path, "utf-8")) : {};
  const tokenizer = new Tokenizer_default(tokenizerJson, configJson);
  return {
    encode(text) {
      const truncated = text.substring(0, MAX_INPUT_CHARS);
      const encoded = tokenizer.encode(truncated, {
        add_special_tokens: true,
        return_token_type_ids: true
      });
      const ids = encoded.ids;
      const attMask = encoded.attention_mask;
      const typeIds = encoded.token_type_ids ?? ids.map(() => 0);
      const seqLen = Math.min(ids.length, MAX_LENGTH);
      const inputIds = new BigInt64Array(MAX_LENGTH);
      const attentionMask = new BigInt64Array(MAX_LENGTH);
      const tokenTypeIds = new BigInt64Array(MAX_LENGTH);
      for (let i = 0; i < seqLen; i++) {
        inputIds[i] = BigInt(ids[i]);
        attentionMask[i] = BigInt(attMask[i]);
        tokenTypeIds[i] = BigInt(typeIds[i]);
      }
      return { inputIds, attentionMask, tokenTypeIds };
    }
  };
}

// src/embedding-runtime.ts
async function createEmbeddingBackend(model, wasm) {
  env2.wasm.proxy = false;
  env2.wasm.numThreads = 1;
  const tokenizer = loadTokenizer(model);
  const modelFile = model.files.get("model_quantized.onnx");
  if (!modelFile) throw new Error("model set missing model_quantized.onnx");
  const modelBuffer = fs2.readFileSync(modelFile.path);
  const session = await InferenceSession2.create(modelBuffer.buffer, {
    executionProviders: ["wasm"]
  });
  const inputNames = session.inputNames;
  return {
    async embed(text) {
      return runInference(session, tokenizer, text);
    },
    async embedQuery(text) {
      const BGE_QUERY_PREFIX2 = "Represent this sentence for searching relevant passages: ";
      const prefixed = text.startsWith(BGE_QUERY_PREFIX2) ? text : BGE_QUERY_PREFIX2 + text;
      return runInference(session, tokenizer, prefixed);
    },
    async close() {
      await session.release();
    },
    debugInputTypes() {
      return inputNames.map((name) => {
        const meta = session.inputNames.includes(name) ? "int64" : "unknown";
        return meta;
      });
    }
  };
}
async function runInference(session, tokenizer, text) {
  const inputs = tokenizer.encode(text);
  const seqLen = inputs.inputIds.length;
  const feeds = {
    input_ids: new Tensor2("int64", inputs.inputIds, [1, seqLen]),
    attention_mask: new Tensor2("int64", inputs.attentionMask, [1, seqLen]),
    token_type_ids: new Tensor2("int64", inputs.tokenTypeIds, [1, seqLen])
  };
  const results = await session.run(feeds);
  const outputKey = session.outputNames[0];
  const output = results[outputKey];
  const data = output.data;
  const hiddenSize = data.length / seqLen;
  const pooled = maskedMeanPool(data, inputs.attentionMask, seqLen, hiddenSize);
  return l2Normalize(pooled);
}
function maskedMeanPool(data, attentionMask, seqLen, hiddenSize) {
  const result = new Float32Array(hiddenSize);
  let maskSum = 0;
  for (let i = 0; i < seqLen; i++) {
    const mask = Number(attentionMask[i]);
    if (mask === 0) continue;
    maskSum += mask;
    const offset = i * hiddenSize;
    for (let j2 = 0; j2 < hiddenSize; j2++) {
      result[j2] = result[j2] + data[offset + j2] * mask;
    }
  }
  if (maskSum > 0) {
    for (let j2 = 0; j2 < hiddenSize; j2++) {
      result[j2] = result[j2] / maskSum;
    }
  }
  return result;
}
function l2Normalize(vector) {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i] / norm;
    }
  }
  return vector;
}

// src/model-cache.ts
import { createHash } from "node:crypto";
import fs3 from "node:fs";
import path from "node:path";
function cacheSlug(manifest) {
  return `${manifest.model.replace("/", "--")}--${manifest.variant}--${manifest.revision.slice(0, 12)}`;
}
function setDir(manifest) {
  return path.join(getModelCacheDir(), cacheSlug(manifest));
}
function stagingDir(manifest) {
  return path.join(getModelCacheDir(), `.staging-${cacheSlug(manifest)}`);
}
function lockPath(manifest) {
  return path.join(getModelCacheDir(), `.lock-${cacheSlug(manifest)}`);
}
function sha256File(filePath) {
  const hash = createHash("sha256");
  const content = fs3.readFileSync(filePath);
  hash.update(content);
  return hash.digest("hex");
}
function verifyFile(filePath, file) {
  try {
    const stat = fs3.statSync(filePath);
    if (stat.size !== file.bytes) return false;
    return sha256File(filePath) === file.sha256;
  } catch {
    return false;
  }
}
function buildVerifiedSet(root, manifest) {
  const files = /* @__PURE__ */ new Map();
  for (const f of manifest.files) {
    files.set(f.name, { path: path.join(root, f.name), sha256: f.sha256, bytes: f.bytes });
  }
  return { root, revision: manifest.revision, variant: manifest.variant, files };
}
function isCompleteSet(root, manifest) {
  const completePath = path.join(root, ".complete");
  if (!fs3.existsSync(completePath)) return false;
  try {
    const marker = fs3.readFileSync(completePath, "utf-8");
    if (!marker.includes(manifest.revision)) return false;
  } catch {
    return false;
  }
  for (const f of manifest.files) {
    if (!verifyFile(path.join(root, f.name), f)) return false;
  }
  return true;
}
async function stageVerifyAndActivate(manifest, source) {
  const target = setDir(manifest);
  if (isCompleteSet(target, manifest)) {
    return buildVerifiedSet(target, manifest);
  }
  const staging = stagingDir(manifest);
  cleanStaging(staging);
  fs3.mkdirSync(staging, { recursive: true });
  const controller = new AbortController();
  try {
    for (const file of manifest.files) {
      const dest = path.join(staging, file.name);
      fs3.mkdirSync(path.dirname(dest), { recursive: true });
      await source.fetch(file, dest, controller.signal);
      const stat = fs3.statSync(dest);
      if (stat.size !== file.bytes) {
        throw new Error(
          `model file "${file.name}": expected ${file.bytes} bytes, got ${stat.size}`
        );
      }
      const actualHash = sha256File(dest);
      if (actualHash !== file.sha256) {
        throw new Error(
          `model file "${file.name}": hash mismatch (expected ${file.sha256}, got ${actualHash})`
        );
      }
    }
    fs3.writeFileSync(
      path.join(staging, ".complete"),
      `${manifest.revision}
${(/* @__PURE__ */ new Date()).toISOString()}
`
    );
    if (fs3.existsSync(target)) {
      fs3.rmSync(target, { recursive: true, force: true });
    }
    fs3.renameSync(staging, target);
  } catch (err) {
    cleanStaging(staging);
    throw err;
  }
  return buildVerifiedSet(target, manifest);
}
function cleanStaging(staging) {
  try {
    if (fs3.existsSync(staging)) fs3.rmSync(staging, { recursive: true, force: true });
  } catch {
  }
}
async function withModelLock(manifest, body) {
  const lp = lockPath(manifest);
  const lock = acquireFileLock(lp);
  if (!lock) {
    const retryDelay = 500;
    const maxRetries = 600;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, retryDelay));
      const retry = acquireFileLock(lp);
      if (retry) {
        try {
          return await body();
        } finally {
          releaseFileLock(retry);
        }
      }
    }
    throw new Error("model cache lock contention: timed out waiting for another process");
  }
  try {
    return await body();
  } finally {
    releaseFileLock(lock);
  }
}
async function ensureModelSet(manifest, source) {
  return withModelLock(manifest, () => stageVerifyAndActivate(manifest, source));
}

// src/model-manifest.ts
import fs4 from "node:fs";
import path2 from "node:path";
function loadModelManifest(packageRoot) {
  const manifestPath = path2.join(packageRoot, "runtime", "model-manifest.json");
  const raw = JSON.parse(fs4.readFileSync(manifestPath, "utf-8"));
  validateManifest(raw);
  return raw;
}
function validateManifest(raw) {
  if (!raw || typeof raw !== "object") throw new Error("model manifest must be an object");
  const m = raw;
  if (m.schema !== 1) throw new Error(`unsupported model manifest schema: ${m.schema}`);
  if (typeof m.model !== "string" || !m.model) throw new Error("model manifest: missing model");
  if (typeof m.revision !== "string" || !m.revision)
    throw new Error("model manifest: missing revision");
  if (m.variant !== "q8") throw new Error(`model manifest: unsupported variant "${m.variant}"`);
  if (!Array.isArray(m.files) || m.files.length === 0) throw new Error("model manifest: no files");
  for (const f of m.files) {
    if (typeof f.name !== "string") throw new Error("model manifest: file missing name");
    if (typeof f.url !== "string") throw new Error(`model manifest: file "${f.name}" missing url`);
    if (typeof f.bytes !== "number" || f.bytes <= 0)
      throw new Error(`model manifest: file "${f.name}" has invalid bytes`);
    if (typeof f.sha256 !== "string" || f.sha256.length !== 64)
      throw new Error(`model manifest: file "${f.name}" has invalid sha256`);
  }
}

// src/embeddings.ts
var BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
var DEFAULT_INIT_TIMEOUT_MS = 18e4;
var backend = null;
var initPromise = null;
function initTimeoutMs() {
  const raw = Number(process.env.MOE_MEMORY_MODEL_INIT_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INIT_TIMEOUT_MS;
}
function loadEmbeddingAssets(packageRoot) {
  const manifestPath = path3.join(packageRoot, "runtime", "embedding-assets.json");
  const raw = JSON.parse(fs5.readFileSync(manifestPath, "utf-8"));
  const wasmPath = path3.join(packageRoot, "runtime", raw.ort.file);
  if (!fs5.existsSync(wasmPath)) {
    throw new Error(`packaged WASM not found at ${wasmPath}`);
  }
  const stat = fs5.statSync(wasmPath);
  if (stat.size !== raw.ort.bytes) {
    throw new Error(`WASM size mismatch: expected ${raw.ort.bytes}, got ${stat.size}`);
  }
  return {
    path: wasmPath,
    sha256: raw.ort.sha256,
    bytes: raw.ort.bytes
  };
}
function createHttpModelSource() {
  return {
    async fetch(file, destination, signal) {
      const response = await globalThis.fetch(file.url, { signal });
      if (!response.ok) throw new Error(`failed to fetch ${file.url}: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs5.writeFileSync(destination, buffer);
    }
  };
}
async function loadBackend() {
  const timeoutAfter = initTimeoutMs();
  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(
        new Error(
          `Embedding model loading timed out after ${timeoutAfter / 1e3}s. The model cache is ${getModelCacheDir()}; a stale lock or a failed partial download there is the usual cause. Remove it and retry.`
        )
      ),
      timeoutAfter
    );
  });
  try {
    const packageRoot = getDefaultPackageRoot();
    if (!packageRoot) {
      throw new Error(
        "Embedding init requires a package root \u2014 setDefaultPackageRoot() must be called first (from index.ts or cli.ts)"
      );
    }
    const manifest = loadModelManifest(packageRoot);
    const wasm = loadEmbeddingAssets(packageRoot);
    console.error("Loading embedding model (first run may take time)...");
    const init = async () => {
      const modelSet = await ensureModelSet(manifest, createHttpModelSource());
      return createEmbeddingBackend(modelSet, wasm);
    };
    backend = await Promise.race([init(), timeout]);
    console.error("Embedding model loaded");
  } catch (error) {
    initPromise = null;
    backend = null;
    throw error;
  } finally {
    if (timeoutId !== void 0) clearTimeout(timeoutId);
  }
}
async function initEmbeddings() {
  if (backend) return;
  if (!initPromise) initPromise = loadBackend();
  return initPromise;
}
function resetEmbeddings() {
  backend = null;
  initPromise = null;
}
var MAX_INPUT_CHARS2 = 2e3;
async function generateEmbedding(text) {
  await initEmbeddings();
  if (!backend) throw new Error("Embedding model not initialized");
  const vector = await backend.embed(text.substring(0, MAX_INPUT_CHARS2));
  return Array.from(vector);
}
function withQueryPrefix(query) {
  if (query.startsWith(BGE_QUERY_PREFIX)) return query;
  return BGE_QUERY_PREFIX + query;
}
async function generateQueryEmbedding(query) {
  await initEmbeddings();
  if (!backend) throw new Error("Embedding model not initialized");
  const vector = await backend.embedQuery(query);
  return Array.from(vector);
}
async function generateExchangeEmbedding(userMessage, assistantMessage, toolNames) {
  let combined = `User: ${userMessage}

Assistant: ${assistantMessage}`;
  if (toolNames && toolNames.length > 0) {
    combined += `

Tools: ${toolNames.join(", ")}`;
  }
  return generateEmbedding(combined);
}
async function generateEntryEmbedding(text) {
  return generateEmbedding(text);
}

export {
  BGE_QUERY_PREFIX,
  initEmbeddings,
  resetEmbeddings,
  generateEmbedding,
  withQueryPrefix,
  generateQueryEmbedding,
  generateExchangeEmbedding,
  generateEntryEmbedding
};
/*! Bundled license information:

onnxruntime-web/dist/ort.node.min.mjs:
  (*!
   * ONNX Runtime Web v1.26.0-dev.20260416-b7804b056c
   * Copyright (c) Microsoft Corporation. All rights reserved.
   * Licensed under the MIT License.
   *)
*/
