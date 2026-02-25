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
        UIWindow *window = [UIApplication sharedApplication].keyWindow;
        if (!window) {
            window = [[UIApplication sharedApplication].windows firstObject];
        }

        CGFloat safeTop = window.safeAreaInsets.top;
        NSString *model = [self getDeviceModel];

        NSString *type = @"None";
        NSMutableArray *rects = [NSMutableArray array];

        // Simple heuristic based on model identifiers
        if ([model hasPrefix:@"iPhone"]) {
            NSArray *components = [model componentsSeparatedByString:@","];
            if (components.count > 0) {
                NSString *majorStr = [components[0] stringByReplacingOccurrencesOfString:@"iPhone" withString:@""];
                NSInteger major = [majorStr integerValue];

                // iPhone 15 series (15,4 / 15,5 / 16,1 / 16,2) -> Island (Major 15, 16)
                // iPhone 14 Pro / Max (15,2 / 15,3) -> Island
                // iPhone 14 / Plus (14,7 / 14,8) -> Notch

                if (major >= 15) {
                    type = @"Island";
                } else if (major >= 10) { // X to 14
                     // Check for SE
                     // SE 2nd (12,8)
                     // SE 3rd (14,6)
                     if ([model isEqualToString:@"iPhone12,8"] || [model isEqualToString:@"iPhone14,6"]) {
                         type = @"None";
                     } else {
                         type = @"Notch";
                     }
                }
            }
        }

        // Dimensions
        CGFloat screenWidth = window.bounds.size.width;

        if ([type isEqualToString:@"Island"]) {
            // Dynamic Island is roughly 126x37 points
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
            // Notch is roughly 209x30 points (iPhone X/11/12/13/14 standard)
            // Height varies (30-34), safe area is usually 44-47.
            // Let's use 30 as visual notch height, centered.
            CGFloat width = 209;
            CGFloat height = 30;
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

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeStatusEdgeSpecJSI>(params);
}

@end
