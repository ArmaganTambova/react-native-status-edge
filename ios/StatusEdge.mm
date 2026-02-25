#import "StatusEdge.h"
#import <sys/utsname.h>
#import <UIKit/UIKit.h>

@implementation StatusEdge
RCT_EXPORT_MODULE()

- (NSString *)getDeviceModel {
    struct utsname systemInfo;
    uname(&systemInfo);
    return [NSString stringWithCString:systemInfo.machine encoding:NSUTF8StringEncoding];
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
        NSString *model = [self getDeviceModel];

        NSString *type = @"None";
        NSMutableArray *rects = [NSMutableArray array];
        CGFloat screenWidth = window.bounds.size.width;

        // Logic: Support ONLY iPhone 11 and newer.
        // iPhone 11 identifier starts with iPhone12,x (12,1 / 12,3 / 12,5)
        // iPhone SE 2nd Gen is 12,8
        // So major version must be >= 12.

        if ([model hasPrefix:@"iPhone"]) {
            NSArray *components = [model componentsSeparatedByString:@","];
            NSString *majorStr = [components[0] stringByReplacingOccurrencesOfString:@"iPhone" withString:@""];
            NSInteger major = [majorStr integerValue];

            if (major < 12) {
                // iPhone X, XS, XR, 8, etc. are not supported.
                type = @"None";
            } else {
                // Major >= 12 (iPhone 11+)

                // Check for SE models (Home button, no notch/island)
                // iPhone SE 2nd Gen (12,8)
                // iPhone SE 3rd Gen (14,6)
                if ([model isEqualToString:@"iPhone12,8"] || [model isEqualToString:@"iPhone14,6"]) {
                    type = @"None";
                }
                // Check for Dynamic Island
                // iPhone 14 Pro (15,2), 14 Pro Max (15,3)
                // iPhone 15 series (15,x), 16 series (16,x)
                // Major >= 15 generally means Island.
                else if (major >= 15) {
                    type = @"Island";
                }
                // Major 12, 13, 14 (except SE) -> Notch
                // iPhone 11 (12,x)
                // iPhone 12 (13,x)
                // iPhone 13 (14,x)
                // iPhone 14/14 Plus (14,7 / 14,8)
                else {
                    type = @"Notch";
                }
            }
        } else {
            // Simulator, iPad, iPod -> None
            type = @"None";
        }

        // Populate dimensions based on type
        if ([type isEqualToString:@"Island"]) {
            // Dynamic Island dimensions (approximate)
            // Width expands, but base pill is ~126x37
            CGFloat width = 126;
            CGFloat height = 37;
            CGFloat x = (screenWidth - width) / 2;
            CGFloat y = 11; // Approx status bar padding

            [rects addObject:@{
                @"x": @(x),
                @"y": @(y),
                @"width": @(width),
                @"height": @(height)
            }];
        } else if ([type isEqualToString:@"Notch"]) {
            // Standard Notch dimensions
            // Width ~209, Height ~30-34
            CGFloat width = 209;
            CGFloat height = 34; // Slightly taller than 30 for safety
            CGFloat x = (screenWidth - width) / 2;
            CGFloat y = 0; // Connected to top

            [rects addObject:@{
                @"x": @(x),
                @"y": @(y),
                @"width": @(width),
                @"height": @(height)
            }];
        }

        NSDictionary *result = @{
            @"cutoutType": type,
            @"cutoutRects": rects,
            @"safeAreaTop": @(safeTop)
        };

        NSError *error;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];
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
