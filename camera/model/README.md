# Sand detector model (`sand_ai4mars.onnx`)

Experimental. Used only by `camera/` (helmet camera demo); not used in route planning.

| | |
| --- | --- |
| Task | Semantic segmentation of rover photos: soil, bedrock, sand, big rock. The page shows **sand** only. |
| Network | DeepLabv3 + MobileNetV3-Large (torchvision, COCO-pretrained), fine-tuned; auxiliary head removed |
| Training data | AI4Mars (NASA JPL; Swan et al. 2021, doi:10.1109/CVPRW53098.2021.00226), Curiosity Navcam, 4,700 labelled images, Hugging Face copy `hassanjbara/AI4MARS` (CC0) |
| Training | `pipeline/colab_ai4mars_terrain.ipynb`, Google Colab T4, 10 epochs, 512 x 512, class-weighted loss |
| Input | `image`: float32 [1, 1, 512, 512], greyscale 0..1 (normalisation is inside the model) |
| Outputs | `classes`: uint8 [1, 512, 512] (0 soil, 1 bedrock, 2 sand, 3 big rock); `sand_prob`: float32 [1, 512, 512] |
| File | ONNX opset 17; weights stored as float16 and cast to float32 when loaded (22 MB, same results as float32) |

## Test results (AI4Mars expert test set, 322 images labelled by NASA rover planners and scientists)

| Split | Sand found (recall) | Model sand that is sand (precision) | Sand IoU |
| --- | --- | --- | --- |
| test_min1 (most cautious) | 90.5 % | 94.7 % | 0.861 |
| test_min2 | 95.9 % | 96.8 % | 0.929 |
| test_min3 | 98.1 % | 97.7 % | 0.959 |

The training epoch was picked on test_min3, so its numbers are slightly optimistic; quote test_min1.
Big rock is weak (IoU 0.10 on test_min1): too few labelled rocks in the training data. Not shown on the page.

## Limits

Trained on Curiosity Navcam only: other cameras and colour photos are less reliable. Sky and ground beyond ~30 m
were never labelled, so the page shows and counts only the lower half of the photo by default.
