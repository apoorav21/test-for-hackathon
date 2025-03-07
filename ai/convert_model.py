import tensorflow as tf
import os
import json

def create_model():
    # Create a new model with the same architecture
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(42,)),
        tf.keras.layers.Dense(128, activation='relu'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(64, activation='relu'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(32, activation='relu'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(5, activation='softmax')
    ])
    
    # Compile the model
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model

def get_layer_weights(layer):
    weights = []
    if isinstance(layer, tf.keras.layers.Dense):
        weights.extend([
            {"name": f"{layer.name}/kernel", "shape": layer.kernel.shape.as_list(), "dtype": "float32"},
            {"name": f"{layer.name}/bias", "shape": layer.bias.shape.as_list(), "dtype": "float32"}
        ])
    elif isinstance(layer, tf.keras.layers.BatchNormalization):
        weights.extend([
            {"name": f"{layer.name}/gamma", "shape": layer.gamma.shape.as_list(), "dtype": "float32"},
            {"name": f"{layer.name}/beta", "shape": layer.beta.shape.as_list(), "dtype": "float32"},
            {"name": f"{layer.name}/moving_mean", "shape": layer.moving_mean.shape.as_list(), "dtype": "float32"},
            {"name": f"{layer.name}/moving_variance", "shape": layer.moving_variance.shape.as_list(), "dtype": "float32"}
        ])
    return weights

def convert_model():
    # Create models directory if it doesn't exist
    os.makedirs('models', exist_ok=True)
    
    # Create a new model
    model = create_model()
    
    # Create tfjs_model directory if it doesn't exist
    os.makedirs('models/tfjs_model', exist_ok=True)
    
    # Save the model architecture
    model_json = model.to_json()
    with open('models/tfjs_model/model.json', 'w') as f:
        f.write(model_json)
    
    # Save the weights
    model.save_weights('models/tfjs_model/weights.bin')
    
    # Create a weights manifest file
    weights_manifest = [{
        "paths": ["weights.bin"],
        "weights": [weight for layer in model.layers for weight in get_layer_weights(layer)]
    }]
    
    # Update the model.json to include the weights manifest
    model_json = json.loads(model_json)
    model_json["weightsManifest"] = weights_manifest
    with open('models/tfjs_model/model.json', 'w') as f:
        json.dump(model_json, f)
    
    print("Model converted successfully!")

if __name__ == "__main__":
    convert_model() 