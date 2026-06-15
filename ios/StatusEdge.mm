#import "StatusEdge.h"
#import <sys/utsname.h>
#import <UIKit/UIKit.h>

@implementation StatusEdge
RCT_EXPORT_MODULE()

- (NSString *)getDeviceModel {
    // On the Simulator utsname.machine is "x86_64"/"arm64"; the real device
    // identifier is exposed via this env var, so prefer it when present.
    NSString *sim = [[NSProcessInfo processInfo] environment][@"SIMULATOR_MODEL_IDENTIFIER"];
    if (sim.length > 0) {
        return sim;
    }
    struct utsname systemInfo;
    uname(&systemInfo);
    return [NSString stringWithCString:systemInfo.machine encoding:NSUTF8StringEncoding];
}

/**
 * Cutout geometry per device identifier, in logical points.
 *
 * iOS exposes no runtime cutout-shape API, so the shape is mapped from the
 * device model. Dimensions are well-supported approximations (Apple does not
 * publish exact notch / Dynamic Island geometry). The resting Dynamic Island
 * pill is ~125x37pt across every Island device; the wide first-gen notch
 * (iPhone 11/12) is ~209pt, narrowed to ~162pt from the iPhone 13 onward
 * (the iPhone 16e kept the notch rather than adopting the Island).
 *
 * Returns @{ "type": "Notch"|"Island"|"None", "w", "h", "top" }.
 * Unknown / future devices fall back to the runtime top safe-area inset, which
 * cleanly separates home-button (<=24pt), notch (~44-50pt) and Island (~59-68pt).
 */
- (NSDictionary *)cutoutInfoForModel:(NSString *)model safeTop:(CGFloat)safeTop {
    static NSDictionary *table;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        table = @{
            // Home-button models — no cutout
            @"iPhone12,8": @{ @"type": @"None" },                              // SE (2nd gen)
            @"iPhone14,6": @{ @"type": @"None" },                              // SE (3rd gen)

            // Original wide notch (iPhone X / XS / XS Max / XR) — same notch as 11/12
            @"iPhone10,3": @{ @"type": @"Notch", @"w": @209, @"h": @30 },      // X
            @"iPhone10,6": @{ @"type": @"Notch", @"w": @209, @"h": @30 },      // X (GSM)
            @"iPhone11,2": @{ @"type": @"Notch", @"w": @209, @"h": @30 },      // XS
            @"iPhone11,4": @{ @"type": @"Notch", @"w": @209, @"h": @30 },      // XS Max
            @"iPhone11,6": @{ @"type": @"Notch", @"w": @209, @"h": @30 },      // XS Max
            @"iPhone11,8": @{ @"type": @"Notch", @"w": @230, @"h": @30 },      // XR (LCD, 11 chassis)

            // Wide first-generation notch (iPhone 11 / 12)
            @"iPhone12,1": @{ @"type": @"Notch", @"w": @230, @"h": @30 },      // 11
            @"iPhone12,3": @{ @"type": @"Notch", @"w": @209, @"h": @30 },      // 11 Pro
            @"iPhone12,5": @{ @"type": @"Notch", @"w": @209, @"h": @30 },      // 11 Pro Max
            @"iPhone13,1": @{ @"type": @"Notch", @"w": @209, @"h": @32 },      // 12 mini
            @"iPhone13,2": @{ @"type": @"Notch", @"w": @209, @"h": @32 },      // 12
            @"iPhone13,3": @{ @"type": @"Notch", @"w": @209, @"h": @32 },      // 12 Pro
            @"iPhone13,4": @{ @"type": @"Notch", @"w": @209, @"h": @32 },      // 12 Pro Max

            // Narrowed notch (iPhone 13 / 14 non-Pro / 16e)
            @"iPhone14,4": @{ @"type": @"Notch", @"w": @162, @"h": @33 },      // 13 mini
            @"iPhone14,5": @{ @"type": @"Notch", @"w": @162, @"h": @33 },      // 13
            @"iPhone14,2": @{ @"type": @"Notch", @"w": @162, @"h": @33 },      // 13 Pro
            @"iPhone14,3": @{ @"type": @"Notch", @"w": @162, @"h": @33 },      // 13 Pro Max
            @"iPhone14,7": @{ @"type": @"Notch", @"w": @162, @"h": @33 },      // 14
            @"iPhone14,8": @{ @"type": @"Notch", @"w": @162, @"h": @33 },      // 14 Plus
            @"iPhone17,5": @{ @"type": @"Notch", @"w": @162, @"h": @33 },      // 16e

            // Dynamic Island
            @"iPhone15,2": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @11 },  // 14 Pro
            @"iPhone15,3": @{ @"type": @"Island", @"w": @126, @"h": @37, @"top": @11 },  // 14 Pro Max
            @"iPhone15,4": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @11 },  // 15
            @"iPhone15,5": @{ @"type": @"Island", @"w": @126, @"h": @37, @"top": @11 },  // 15 Plus
            @"iPhone16,1": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @11 },  // 15 Pro
            @"iPhone16,2": @{ @"type": @"Island", @"w": @126, @"h": @37, @"top": @11 },  // 15 Pro Max
            @"iPhone17,3": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @11 },  // 16
            @"iPhone17,4": @{ @"type": @"Island", @"w": @126, @"h": @37, @"top": @11 },  // 16 Plus
            @"iPhone17,1": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @12 },  // 16 Pro
            @"iPhone17,2": @{ @"type": @"Island", @"w": @126, @"h": @37, @"top": @12 },  // 16 Pro Max
            @"iPhone18,3": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @12 },  // 17
            @"iPhone18,1": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @12 },  // 17 Pro
            @"iPhone18,2": @{ @"type": @"Island", @"w": @126, @"h": @37, @"top": @12 },  // 17 Pro Max
            @"iPhone18,4": @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @13 },  // iPhone Air
        };
    });

    NSDictionary *info = table[model];
    if (info) {
        return info;
    }

    // Unknown / future device — fall back to the runtime safe-area inset.
    if (![model hasPrefix:@"iPhone"]) {
        return @{ @"type": @"None" };           // iPad / iPod / unknown
    }
    if (safeTop <= 24.0) {
        return @{ @"type": @"None" };           // home-button class
    }
    if (safeTop >= 55.0) {
        return @{ @"type": @"Island", @"w": @125, @"h": @37, @"top": @12 };
    }
    return @{ @"type": @"Notch", @"w": @162, @"h": @33 };
}

- (void)getCutoutData:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_main_queue(), ^{
        UIWindow *window = nil;
        if (@available(iOS 13.0, *)) {
            for (UIWindowScene *scene in [UIApplication sharedApplication].connectedScenes) {
                if (scene.activationState == UISceneActivationStateForegroundActive) {
                    for (UIWindow *w in scene.windows) {
                        if (w.isKeyWindow) {
                            window = w;
                            break;
                        }
                    }
                }
                if (window) break;
            }
        }
        if (!window) {
            window = [[UIApplication sharedApplication].windows firstObject];
        }

        CGFloat safeTop = window.safeAreaInsets.top;
        CGFloat screenWidth = window.bounds.size.width;
        if (screenWidth <= 0) {
            screenWidth = [UIScreen mainScreen].bounds.size.width;
        }

        NSString *model = [self getDeviceModel];
        NSDictionary *info = [self cutoutInfoForModel:model safeTop:safeTop];
        NSString *type = info[@"type"];

        NSMutableArray *rects = [NSMutableArray array];
        if ([type isEqualToString:@"Notch"]) {
            CGFloat width  = [info[@"w"] doubleValue];
            CGFloat height = [info[@"h"] doubleValue];
            CGFloat x = (screenWidth - width) / 2.0;
            [rects addObject:@{ @"x": @(x), @"y": @(0), @"width": @(width), @"height": @(height) }];
        } else if ([type isEqualToString:@"Island"]) {
            CGFloat width  = [info[@"w"] doubleValue];
            CGFloat height = [info[@"h"] doubleValue];
            CGFloat top    = info[@"top"] ? [info[@"top"] doubleValue] : 11.0;
            CGFloat x = (screenWidth - width) / 2.0;
            [rects addObject:@{ @"x": @(x), @"y": @(top), @"width": @(width), @"height": @(height) }];
        }

        NSDictionary *result = @{
            @"cutoutType":    type,
            @"cutoutRects":   rects,
            @"cameraCircles": @[],          // iOS has no runtime camera geometry
            @"mainRectIndex": @0,
            @"safeAreaTop":   @(safeTop)
        };

        NSError *error = nil;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];
        if (!jsonData) {
            reject(@"STATUS_EDGE_ERROR", error.localizedDescription ?: @"Failed to serialize cutout data", error);
            return;
        }
        NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        resolve(jsonString);
    });
}

// TurboModule scaffolding
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeStatusEdgeSpecJSI>(params);
}

@end
